import { resolve, extname, basename, dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import type { MagickParams, ServiceResult } from "../types";
import { isExistingFile, isExistingDirectory, IMAGE_EXTENSIONS, getExtension } from "../utils/validators";

// ─── Build ImageMagick Argument Arrays ─────────────────────────────

function buildArgs(params: MagickParams): string[] {
  const { action, input, output, format, quality, scale } = params;
  const ext = extname(input).toLowerCase();
  const base = basename(input, ext);

  // NOTE: bulk-convert and icon-bundle are handled in dedicated helpers
  // before this function is called, so they are intentionally omitted here.

  switch (action) {
    case "convert": {
      const outPath = output || `${base}.${format || "png"}`;
      return [input, outPath];
    }

    case "smart-scale": {
      const outPath = output || `${base}-scaled${ext || ".png"}`;
      const dim = scale || "50%";
      return [input, "-filter", "Lanczos", "-resize", dim, "-unsharp", "0.5x0.5+0.7+0.02", outPath];
    }

    case "web-optimize": {
      const outFmt = format || "webp";
      const outPath = output || `${base}-optimized.${outFmt}`;
      const q = quality ?? 85;
      return [input, "-strip", "-quality", String(q), "-define", `${outFmt}:lossless=false`, outPath];
    }

    default:
      // bulk-convert and icon-bundle should never reach here
      throw new Error(`Unknown Magick action: ${action}`);
  }
}

// ─── Bulk Convert Helper ───────────────────────────────────────────
async function bulkConvert(params: MagickParams): Promise<ServiceResult> {
  const { input, format } = params;
  const outDir = resolve(params.output || `${input}/converted`);

  // Reasonable concurrency limit to avoid overwhelming the system
  const CONCURRENCY = 4;

  let files: string[];
  try {
    files = readdirSync(input).filter(f => {
      const e = getExtension(f);
      return IMAGE_EXTENSIONS.includes(e);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Cannot read directory: ${msg}` };
  }

  if (files.length === 0) {
    return { success: false, error: `No supported images in ${input}` };
  }

  // Convert a single file, return true on success
  const convertOne = async (file: string): Promise<boolean> => {
    const src = join(input, file);
    const outFile = `${basename(file, extname(file))}.${format || "png"}`;
    const dest = join(outDir, outFile);

    const proc = Bun.spawn(["magick", src, dest], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      // continue converting other files even if one fails
      return false;
    }
    return true;
  };

  try {
    let converted = 0;
    // Run in batches to limit concurrency
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(convertOne));
      converted += results.filter(Boolean).length;
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
      const errMsg = await new Response(proc1.stderr).text();
      return { success: false, error: `ICO generation failed: ${errMsg.slice(0, 200)}` };
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
      const errMsg = await new Response(proc2.stderr).text();
      return { success: false, error: `ICNS generation failed: ${errMsg.slice(0, 200)}` };
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
  // The output path is always the last argument in the args array built by buildArgs
  const outputPath = resolve(args[args.length - 1]);

  try {
    const proc = Bun.spawn(["magick", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exitCode = await proc.exited;
    const magickStderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      const lines = magickStderr.split("\n").filter(l =>
        /[Ee]rror|Invalid|Cannot|failed|Unknown|No such|not found/i.test(l),
      );
      const firstError = lines.length > 0
        ? lines[0].trim()
        : magickStderr.split("\n").find(l => l.trim().length > 0)?.trim() || "";
      const msg = firstError
        ? firstError.replace(/\[[^\]]*\]\s*/, "").substring(0, 300)
        : `ImageMagick exited with code ${exitCode}`;
      return { success: false, error: msg };
    }

    return { success: true, outputPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
