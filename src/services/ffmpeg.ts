import { resolve, extname, dirname, basename } from "node:path";
import type { FfmpegParams, ServiceResult } from "../types";
import { isExistingFile } from "../utils/validators";

// ─── Build FFmpeg Argument Arrays ──────────────────────────────────

function buildArgs(params: FfmpegParams): string[] {
  const { action, input, output, format, trimStart, trimEnd, fps } = params;
  const ext = extname(input).toLowerCase();
  const base = basename(input, ext);

  switch (action) {
    case "convert": {
      const outFmt = format || "mp4";
      const outPath = output || `${base}.${outFmt}`;
      return [
        "-i", input,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "192k",
        "-y", outPath,
      ];
    }

    case "trim": {
      const outExt = ext || ".mp4";
      const outPath = output || `${base}-trimmed${outExt}`;
      const args: string[] = [];
      if (trimStart) args.push("-ss", trimStart);
      if (trimEnd) args.push("-to", trimEnd);
      args.push("-i", input, "-c", "copy", "-y", outPath);
      return args;
    }

    case "extract-audio": {
      const outFmt = format || "mp3";
      const outPath = output || `${base}-audio.${outFmt}`;
      if (outFmt === "mp3") {
        return [
          "-i", input,
          "-vn",
          "-c:a", "libmp3lame",
          "-b:a", "320k",
          "-y", outPath,
        ];
      }
      return [
        "-i", input,
        "-vn",
        "-c:a", "pcm_s16le",
        "-y", outPath,
      ];
    }

    case "strip-audio": {
      const outExt = ext || ".mp4";
      const outPath = output || `${base}-muted${outExt}`;
      return ["-i", input, "-c:v", "copy", "-an", "-y", outPath];
    }

    case "make-gif": {
      const outPath = output || `${base}.gif`;
      const gifFps = fps ?? 15;
      return [
        "-ss", trimStart || "0",
        "-to", trimEnd || "10",
        "-i", input,
        "-vf",
        `fps=${gifFps},scale=iw/2:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
        "-y", outPath,
      ];
    }

    default:
      throw new Error(`Unknown FFmpeg action: ${action}`);
  }
}

// ─── Execute FFmpeg (no spinner — caller provides feedback) ─────────
export async function runFfmpeg(params: FfmpegParams): Promise<ServiceResult> {
  if (!isExistingFile(params.input)) {
    return { success: false, error: `Input file not found: ${params.input}` };
  }

  const args = buildArgs(params);
  const outputPath = resolve(args[args.length - 1]);

  try {
    const proc = Bun.spawn(["ffmpeg", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const lines = stderr.split("\n").filter(l => l.includes("Error") || l.includes("error"));
      const msg = lines.length > 0 ? lines[0].trim() : `FFmpeg exited with code ${exitCode}`;
      return { success: false, error: msg };
    }

    return { success: true, outputPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
