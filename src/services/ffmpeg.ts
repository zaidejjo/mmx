import { resolve, extname, dirname, basename } from "node:path";
import type { FfmpegParams, ServiceResult } from "../types";
import { isExistingFile } from "../utils/validators";

// ─── Build FFmpeg Argument Arrays ──────────────────────────────────

/** Exported for unit testing — prefer using runFfmpeg() in production code. */
export function buildArgs(params: FfmpegParams): string[] {
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
      // -ss before -i = fast seek (keyframe-aligned start)
      if (trimStart) args.push("-ss", trimStart);
      args.push("-i", input);
      // -to after -i = output stop position (not input duration limit)
      if (trimEnd) args.push("-to", trimEnd);
      // -c copy = stream copy (no re-encode, lossless cut)
      // -avoid_negative_ts make_zero and -copyts ensure correct timestamps
      // when seeking to a keyframe before the requested -ss position
      args.push("-c", "copy", "-avoid_negative_ts", "make_zero", "-copyts", "-y", outPath);
      return args;
    }

    case "extract-audio": {
      const outFmt = format || "mp3";
      const outPath = output || `${base}-audio.${outFmt}`;
      // -map 0:a explicitly selects all audio streams to avoid including
      // other stream types (data, subtitles, etc.) when using -vn
      if (outFmt === "mp3") {
        return [
          "-i", input,
          "-vn",
          "-map", "0:a",
          "-c:a", "libmp3lame",
          "-b:a", "320k",
          "-y", outPath,
        ];
      }
      return [
        "-i", input,
        "-vn",
        "-map", "0:a",
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
      const args: string[] = [];
      // -ss before -i = fast input seek
      args.push("-ss", trimStart || "0");
      args.push("-i", input);
      // -to after -i = output stop position
      if (trimEnd) args.push("-to", trimEnd);
      args.push(
        "-vf",
        `fps=${gifFps},scale=iw/2:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
        "-y", outPath,
      );
      return args;
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

    const ffmpegErr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      // FFmpeg uses various error patterns: "Error", "error", "Invalid",
      // "Cannot", "failed", "Unknown", "No such", etc. — cast a wider net.
      const lines = ffmpegErr.split("\n").filter(l =>
        /[Ee]rror|Invalid|Cannot|failed|Unknown|No such|not found/i.test(l),
      );
      const firstError = lines.length > 0
        ? lines[0].trim()
        : ffmpegErr.split("\n").find(l => l.trim().length > 0)?.trim() || "";
      const msg = firstError
        ? firstError.replace(/\[[^\]]*\]\s*/, "").substring(0, 300)
        : `FFmpeg exited with code ${exitCode}`;
      return { success: false, error: msg };
    }

    return { success: true, outputPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
