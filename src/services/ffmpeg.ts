import { resolve, extname, dirname, basename, join } from "node:path";
import { readdirSync, statSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
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

// ─── Info: get media metadata via ffprobe ────────────────────────────
async function getMediaInfo(filePath: string): Promise<ServiceResult> {
  if (!isExistingFile(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  try {
    const proc = Bun.spawn([
      "ffprobe", "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return { success: false, error: "ffprobe failed — is this a valid media file?" };
    }

    const data = JSON.parse(stdout);
    const fmt = data.format || {};
    const streams = data.streams || [];

    const videoStream = streams.find((s: Record<string, unknown>) => s.codec_type === "video");
    const audioStream = streams.find((s: Record<string, unknown>) => s.codec_type === "audio");

    const formatName = (fmt.format_name || "?").toUpperCase();
    const dur = fmt.duration ? formatDurStr(parseFloat(fmt.duration)) : "?";
    const size = fmt.size ? formatBytes(parseInt(fmt.size, 10)) : "?";
    const bitrate = fmt.bit_rate ? `${(parseInt(fmt.bit_rate, 10) / 1000).toFixed(0)} Kbps` : "?";

    const lines: string[] = [
      `  Format       ${formatName}`,
      `  Duration     ${dur}`,
      `  Size         ${size}`,
      `  Bitrate      ${bitrate}`,
      "",
    ];

    if (videoStream) {
      const codec = (videoStream.codec_name || "?").toUpperCase();
      const w = videoStream.width ?? "?";
      const h = videoStream.height ?? "?";
      const fps = videoStream.r_frame_rate
        ? evalFrac(videoStream.r_frame_rate as string)
        : "?";
      lines.push("  Video:");
      lines.push(`    Codec:       ${codec}`);
      lines.push(`    Resolution:  ${w}x${h}`);
      lines.push(`    FPS:         ${fps}`);
      lines.push("");
    }

    if (audioStream) {
      const aCodec = (audioStream.codec_name || "?").toUpperCase();
      const ch = audioStream.channels ?? "?";
      const sr = audioStream.sample_rate ? `${(parseInt(audioStream.sample_rate as string, 10) / 1000).toFixed(0)} KHz` : "?";
      lines.push("  Audio:");
      lines.push(`    Codec:       ${aCodec}`);
      lines.push(`    Channels:    ${ch}`);
      lines.push(`    Sample Rate: ${sr}`);
      lines.push("");
    }

    // Remove trailing blank line
    if (lines[lines.length - 1] === "") lines.pop();

    return { success: true, data: lines.join("\n") };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to read media info: ${msg}` };
  }
}

// ─── Bulk Video Convert ──────────────────────────────────────────────
const VIDEO_EXTS = ["mp4", "mkv", "mov", "avi", "webm", "m4v", "flv", "wmv"];

async function bulkVideoConvert(params: FfmpegParams): Promise<ServiceResult> {
  const dir = params.input;
  const outFmt = params.format || "mp4";
  const outDir = resolve(params.output || `${dir}/converted`);
  const CONCURRENCY = 4;

  let files: string[];
  try {
    files = readdirSync(dir).filter(f => {
      const ext = extname(f).toLowerCase().slice(1);
      return VIDEO_EXTS.includes(ext);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Cannot read directory: ${msg}` };
  }

  if (files.length === 0) {
    return { success: false, error: `No supported video files in ${dir}` };
  }

  if (!existsSync(outDir)) {
    try { mkdirSync(outDir, { recursive: true }); } catch {
      return { success: false, error: `Cannot create output directory: ${outDir}` };
    }
  }

  const convertOne = async (file: string): Promise<boolean> => {
    const src = join(dir, file);
    const outFile = `${basename(file, extname(file))}.${outFmt}`;
    const dest = join(outDir, outFile);

    const proc = Bun.spawn(["ffmpeg", "-i", src, "-y", dest], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  };

  let converted = 0;
  try {
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

// ─── Join / Concatenate Videos ───────────────────────────────────────
async function joinVideos(params: FfmpegParams): Promise<ServiceResult> {
  const fileList = params.inputs;
  if (!fileList || fileList.length < 2) {
    return { success: false, error: "Need at least 2 files to join" };
  }

  // Create temp file list for FFmpeg concat demuxer
  const tmpFile = resolve("/tmp", `mmx-concat-${Date.now()}.txt`);
  const lines = fileList.map(f => `file '${f.replace(/'/g, "'\\''")}'`);
  writeFileSync(tmpFile, lines.join("\n") + "\n");

  const outPath = resolve(params.output || `${dirname(fileList[0])}/joined_${basename(fileList[0])}`);

  try {
    const proc = Bun.spawn([
      "ffmpeg",
      "-f", "concat",
      "-safe", "0",
      "-i", tmpFile,
      "-c", "copy",
      "-y", outPath,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    const ffmpegErr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    unlinkSync(tmpFile);

    if (exitCode !== 0) {
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

    return { success: true, outputPath: outPath };
  } catch (err) {
    // Clean up temp file on error
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ─── Smart Optimize for Platforms ────────────────────────────────────
async function optimizeVideo(params: FfmpegParams): Promise<ServiceResult> {
  const input = params.input;
  const platform = params.platform || "discord";
  const targetMB = platform === "nitro" ? 48 : 9.5;
  const targetBytes = targetMB * 1024 * 1024;
  const platformLabel = platform === "nitro" ? "Discord Nitro / Slack" : "Discord Free";

  if (!isExistingFile(input)) {
    return { success: false, error: `Input file not found: ${input}` };
  }

  // 1. Get duration via ffprobe
  let duration: number;
  try {
    const proc = Bun.spawn([
      "ffprobe", "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      input,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const out = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return { success: false, error: "ffprobe failed — is this a valid media file?" };
    }
    duration = parseFloat(out.trim());
    if (Number.isNaN(duration) || duration <= 0) {
      return { success: false, error: "Cannot read video duration" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `ffprobe failed: ${msg}` };
  }

  // 2. Calculate bitrates
  const totalBitrate = Math.floor((targetBytes * 8) / duration);       // bps
  const audioBitrate = 128000;                                          // 128 Kbps
  const videoBitrate = totalBitrate - audioBitrate;

  if (videoBitrate < 50000) {
    const estSizeKB = ((videoBitrate + audioBitrate) * duration) / 8 / 1024;
    return {
      success: false,
      error: `Video too long (${formatDurStr(duration)}) for ${platformLabel} (${targetMB}MB target). `
           + `Estimated size at minimum bitrate: ${(estSizeKB / 1024).toFixed(1)}MB. `
           + `Try trimming first or choose a shorter clip.`,
    };
  }

  // 3. Run FFmpeg with calculated bitrates
  const base = basename(input, extname(input).toLowerCase());
  const outPath = resolve(
    params.output || `${dirname(input)}/${base}_optimized_${platform}.mp4`,
  );

  const args = [
    "-i", input,
    "-c:v", "libx264",
    "-b:v", String(videoBitrate),
    "-preset", "medium",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y", outPath,
  ];

  try {
    const proc = Bun.spawn(["ffmpeg", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ffmpegErr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errLines = ffmpegErr.split("\n").filter(l =>
        /[Ee]rror|Invalid|Cannot|failed|Unknown|No such|not found/i.test(l),
      );
      const firstError = errLines.length > 0
        ? errLines[0].trim()
        : ffmpegErr.split("\n").find(l => l.trim().length > 0)?.trim() || "";
      const msg = firstError
        ? firstError.replace(/\[[^\]]*\]\s*/, "").substring(0, 300)
        : `FFmpeg exited with code ${exitCode}`;
      return { success: false, error: msg };
    }

    return { success: true, outputPath: outPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ─── Small Helpers ───────────────────────────────────────────────────
function formatDurStr(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function evalFrac(frac: string): string {
  const parts = frac.split("/");
  if (parts.length !== 2) return frac;
  const n = parseFloat(parts[0]);
  const d = parseFloat(parts[1]);
  if (d === 0) return frac;
  return (n / d).toFixed(2);
}

// ─── Execute FFmpeg (no spinner — caller provides feedback) ─────────
export async function runFfmpeg(params: FfmpegParams): Promise<ServiceResult> {
  // Route non-standard actions to dedicated handlers
  if (params.action === "info") {
    return getMediaInfo(params.input);
  }
  if (params.action === "bulk-convert") {
    return bulkVideoConvert(params);
  }
  if (params.action === "join") {
    return joinVideos(params);
  }
  if (params.action === "optimize") {
    return optimizeVideo(params);
  }

  // Standard actions require a valid input file
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
