// ─── Tool Selection ────────────────────────────────────────────────
export type Tool = "ffmpeg" | "magick";

// ─── FFmpeg Actions ────────────────────────────────────────────────
export type FfmpegAction =
  | "convert"
  | "trim"
  | "extract-audio"
  | "strip-audio"
  | "make-gif"
  | "info"
  | "bulk-convert"
  | "join"
  | "optimize";

// ─── ImageMagick Actions ───────────────────────────────────────────
export type MagickAction =
  | "convert"
  | "bulk-convert"
  | "smart-scale"
  | "icon-bundle"
  | "web-optimize";

export type AnyAction = FfmpegAction | MagickAction;

// ─── Supported Formats ─────────────────────────────────────────────
export type VideoFormat = "mp4" | "mkv" | "mov" | "avi" | "webm";
export type AudioFormat = "mp3" | "wav";
export type ImageFormat = "png" | "jpg" | "webp" | "avif";

// ─── CLI Flag Parsing Types ────────────────────────────────────────
export interface ParsedArgs {
  tool?: Tool;
  action?: AnyAction;
  input?: string;
  output?: string;
  format?: string;
  quality?: number;
  help?: boolean;
  ascii?: boolean;
  trimStart?: string;
  trimEnd?: string;
  fps?: number;
  scale?: string;
  platform?: string;
}

// ─── Service Execution Params ──────────────────────────────────────
export interface FfmpegParams {
  action: FfmpegAction;
  input: string;
  /** Multiple inputs for join/concat actions. */
  inputs?: string[];
  output?: string;
  format?: VideoFormat | AudioFormat;
  /** Target platform for optimize action ("discord" | "nitro"). */
  platform?: string;
  trimStart?: string;
  trimEnd?: string;
  fps?: number;
}

export interface MagickParams {
  action: MagickAction;
  input: string;
  output?: string;
  format?: ImageFormat;
  quality?: number;
  scale?: string;
}

export interface ServiceResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  /** Free-form data for info/inspect actions. */
  data?: string;
}
