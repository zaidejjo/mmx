import { resolve, extname, basename, dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import type { MagickParams, ServiceResult } from "../types";
import { isExistingFile, isExistingDirectory, IMAGE_EXTENSIONS, getExtension } from "../utils/validators";

// ─── Build ImageMagick Argument Arrays ─────────────────────────────

function buildArgs(params: MagickParams): string[] {
  const { action, input, output, format, quality, scale } = params;
  const ext = extname(input).toLowerCase();
  const base = basename(input, ext);

  switch (action) {
    case "convert": {
      const outPath = output || `${base}.${format || "png"}`;
      return [input, outPath];
    }

    case "bulk-convert": {
      const outFmt = format || "png";
      const outDir = output || `${input}/${format || "converted"}`;
      return ["mogrify", "-path", outDir, "-format", outFmt.toUpperCase(), `${input}/*.${ext}`];
    }

    case "smart-scale": {
      const outPath = output || `${base}-scaled${ext || ".png"}`;
      const dim = scale || "50%";
      return [input, "-filter", "Lanczos", "-resize", dim, "-unsharp", "0.5x0.5+0.7+0.02", outPath];
    }

    case "icon-bundle": {
      const icoPath = output || `${base}.ico`;
      const icnsPath = output
        ? join(dirname(output), `${basename(output, extname(output))}.icns`)
        : `${base}.icns`;
      return [
        input,
        "-define", "icon:auto-resize=16,32,48,64,128,256",
        icoPath,
        "&&",
        input,
        "-define", "icon:auto-resize=16,32,48,64,128,256",
        icnsPath,
      ];
    }

    case "web-optimize": {
      const outFmt = format || "webp";
      const outPath = output || `${base}-optimized.${outFmt}`;
      const q = quality ?? 85;
      return [input, "-strip", "-quality", String(q), "-define", `${outFmt}:lossless=false`, outPath];
    }

    default:
      throw new Error(`Unknown Magick action: ${action}`);
  }
}

// ─── Bulk Convert Helper ───────────────────────────────────────────
async function bulkConvert(params: MagickParams): Promise<ServiceResult> {
  const { input, format } = params;
  const outFmt = (format || "png").toUpperCase();
  const outDir = resolve(params.output || `${input}/converted`);

  try {
    const files = readdirSync(input).filter(f => {
      const e = getExtension(f);
      return IMAGE_EXTENSIONS.includes(e);
    });

    if (files.length === 0) {
      return { success: false, error: `No supported images in ${input}` };
    }

    let converted = 0;
    for (const file of files) {
      const src = join(input, file);
      const outFile = `${basename(file, extname(file))}.${format || "png"}`;
      const dest = join(outDir, outFile);

      const proc = Bun.spawn(["magick", src, dest], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        // continue converting other files even if one fails
        continue;
      }
      converted++;
    }

    return { success: true, outputPath: outDir };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ─── Icon Bundle Helper (.ico + .icns) ────────────────────────────
async function iconBundle(params: MagickParams): Promise<ServiceResult> {
  const { input } = params;
  const ext = extname(input);
  const base = basename(input, ext);

  const icoPath = resolve(params.output || `${base}.ico`);
  const icoDir = dirname(icoPath);
  const icoBase = basename(icoPath, extname(icoPath));
  const icnsPath = resolve(join(icoDir, `${icoBase}.icns`));

  const resolutions = "16,32,48,64,128,256";

  try {
    const proc1 = Bun.spawn(
      ["magick", input, "-define", `icon:auto-resize=${resolutions}`, icoPath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const exit1 = await proc1.exited;
    if (exit1 !== 0) {
      const stderr = await new Response(proc1.stderr).text();
      return { success: false, error: `ICO generation failed: ${stderr.slice(0, 200)}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }

  try {
    const proc2 = Bun.spawn(
      ["magick", input, "-define", `icon:auto-resize=${resolutions}`, icnsPath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const exit2 = await proc2.exited;
    if (exit2 !== 0) {
      const stderr = await new Response(proc2.stderr).text();
      return { success: false, error: `ICNS generation failed: ${stderr.slice(0, 200)}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }

  return { success: true, outputPath: `${icoPath}, ${icnsPath}` };
}

// ─── Execute ImageMagick (no spinner — caller provides feedback) ────
export async function runMagick(params: MagickParams): Promise<ServiceResult> {
  if (params.action === "bulk-convert") {
    if (!isExistingDirectory(params.input)) {
      return { success: false, error: `Input directory not found: ${params.input}` };
    }
    return bulkConvert(params);
  }

  if (params.action === "icon-bundle") {
    if (!isExistingFile(params.input)) {
      return { success: false, error: `Input file not found: ${params.input}` };
    }
    return iconBundle(params);
  }

  // Single-file operations
  if (!isExistingFile(params.input)) {
    return { success: false, error: `Input file not found: ${params.input}` };
  }

  const args = buildArgs(params);
  let outputPath: string;

  if (params.action === "convert") {
    const outFmt = params.format || "png";
    const e = extname(params.input);
    const b = basename(params.input, e);
    outputPath = resolve(params.output || `${b}.${outFmt}`);
  } else if (params.action === "smart-scale") {
    const e = extname(params.input);
    const b = basename(params.input, e);
    outputPath = resolve(params.output || `${b}-scaled${e}`);
  } else if (params.action === "web-optimize") {
    const outFmt = params.format || "webp";
    const e = extname(params.input);
    const b = basename(params.input, e);
    outputPath = resolve(params.output || `${b}-optimized.${outFmt}`);
  } else {
    outputPath = resolve(args[args.length - 1]);
  }

  try {
    const proc = Bun.spawn(["magick", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      const lines = stderr.split("\n").filter(l => l.includes("Error") || l.includes("error"));
      const msg = lines.length > 0 ? lines[0].trim() : `ImageMagick exited with code ${exitCode}`;
      return { success: false, error: msg };
    }

    return { success: true, outputPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
