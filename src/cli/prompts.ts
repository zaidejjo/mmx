import * as p from "@clack/prompts";
import pc from "picocolors";
import { basename, extname, resolve, dirname } from "node:path";
import { banner } from "./render";
import { fileBrowser, directoryBrowser } from "./filebrowser";
import { runFfmpeg } from "../services/ffmpeg";
import { runMagick } from "../services/imagemagick";
import { createSpinner } from "../utils/spinner";
import { validateTimestamp, validateScale, validateTrimRange, isExistingFile } from "../utils/validators";
import type { Tool, FfmpegAction, MagickAction, VideoFormat, AudioFormat, ImageFormat } from "../types";

// ─── Supported extension lists (lowercase, no dot) ──────────────────
const VIDEO_EXTS = ["mp4", "mkv", "mov", "avi", "webm", "m4v", "flv", "wmv"];
const AUDIO_EXTS = ["mp3", "wav", "flac", "aac", "ogg", "wma", "m4a"];
const IMAGE_EXTS  = ["png", "jpg", "jpeg", "webp", "avif", "tiff", "bmp", "gif", "svg"];

// ─── Internal tool mapping (hidden from user-facing menus) ──────────
type UserCategory = "video-audio" | "image";

const CATEGORY_TO_TOOL: Record<UserCategory, Tool> = {
  "video-audio": "ffmpeg",
  image: "magick",
};

// ─── Media duration helpers ──────────────────────────────────────────
/** Get media file duration in seconds via ffprobe. Returns null on failure. */
async function getMediaDuration(filePath: string): Promise<number | null> {
  try {
    const proc = Bun.spawn([
      "ffprobe", "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      const seconds = parseFloat(output.trim());
      return Number.isNaN(seconds) ? null : seconds;
    }
    return null;
  } catch {
    return null;
  }
}

/** Format total seconds as HH:MM:SS (rounded down). */
function formatSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Output path helpers ────────────────────────────────────────────
// Generates a sensible default like  "zaid_scaled.png"
// The caller must prepend the desired directory (e.g. dirname(inputPath)).
function smartName(inputPath: string, action: string, format?: string): string {
  const base = basename(inputPath, extname(inputPath));

  const SUFFIXES: Record<string, string> = {
    convert:        "_converted",
    trim:           "_trimmed",
    "extract-audio": "_audio",
    "strip-audio":  "_muted",
    "make-gif":     "",
    "smart-scale":  "_scaled",
    "icon-bundle":  "_icon",
    "web-optimize": "_optimized",
    optimize:       "_optimized",
  };

  const FORMATS: Record<string, string> = {
    convert:        "mp4",
    trim:           "mp4",
    "extract-audio": "mp3",
    "strip-audio":  "mp4",
    "make-gif":     "gif",
    "smart-scale":  "png",
    "icon-bundle":  "ico",
    "web-optimize": "webp",
    optimize:       "mp4",
  };

  const suffix = SUFFIXES[action] ?? `_${action}`;
  const ext = format || FORMATS[action] || extname(inputPath).slice(1) || "out";
  const name = `${base}${suffix}.${ext}`;
  // Strip any accidental leading colon (defensive)
  return name.replace(/^:/, "");
}

/** Build an absolute default output path alongside the input file. */
function defaultOutputPath(inputPath: string, action: string, format?: string): string {
  return resolve(dirname(inputPath), smartName(inputPath, action, format));
}

// ─── Spinner-wrapped service call for FFmpeg ────────────────────────
async function runFfmpegWithFeedback(
  params: Parameters<typeof runFfmpeg>[0],
): Promise<boolean> {
  // info action: no spinner, just display data
  if (params.action === "info") {
    const result = await runFfmpeg(params);
    if (result.success && result.data) {
      console.log(pc.dim("  ─────────────────────────"));
      console.log(result.data);
      console.log(pc.dim("  ─────────────────────────"));
      return true;
    }
    p.log.error(pc.red(`  ${result.error || "info failed"}`));
    return false;
  }

  const spin = createSpinner();
  spin.start(`${params.action} ...`);
  const result = await runFfmpeg(params);
  if (result.success) {
    spin.stop(`${params.action} complete  →  ${result.outputPath}`, "ok");
    return true;
  }
  spin.stop(result.error || `${params.action} failed`, "error");
  p.log.error(pc.red(`  ${result.error || "unknown error"}`));
  return false;
}

// ─── Spinner-wrapped service call for ImageMagick ───────────────────
async function runMagickWithFeedback(
  params: Parameters<typeof runMagick>[0],
): Promise<boolean> {
  const spin = createSpinner();
  spin.start(`${params.action} ...`);
  const result = await runMagick(params);
  if (result.success) {
    spin.stop(`${params.action} complete  →  ${result.outputPath}`, "ok");
    return true;
  }
  spin.stop(result.error || `${params.action} failed`, "error");
  p.log.error(pc.red(`  ${result.error || "unknown error"}`));
  return false;
}

// ─── Category Selector (abstracts FFmpeg/ImageMagick) ────────────────
async function selectCategory(): Promise<UserCategory> {
  const cat = await p.select({
    message: pc.dim("What would you like to work with?"),
    options: [
      {
        value: "video-audio",
        label: "Video & Audio",
        hint: "convert, trim, info, bulk convert, join",
      },
      {
        value: "image",
        label: "Image Manipulation",
        hint: "convert, scale, icon bundles, optimize",
      },
    ],
  });
  if (p.isCancel(cat)) {
    p.cancel("cancelled");
    process.exit(0);
  }
  return cat as UserCategory;
}

// ─── FFmpeg Action Selector ─────────────────────────────────────────
async function selectFfmpegAction(): Promise<FfmpegAction> {
  const action = await p.select({
    message: pc.dim("Select an action"),
    options: [
      { value: "convert", label: "Convert Video", hint: "change format" },
      { value: "trim", label: "Trim Video/Audio", hint: "sub-second accuracy" },
      { value: "extract-audio", label: "Extract Audio", hint: "320kbps MP3 / WAV" },
      { value: "strip-audio", label: "Strip Audio", hint: "mute, no re-encode" },
      { value: "make-gif", label: "Make GIF", hint: "high-quality palette" },
      { value: "info", label: "Media Info", hint: "codecs, resolution, duration" },
      { value: "bulk-convert", label: "Bulk Convert", hint: "batch video format" },
      { value: "join", label: "Join Videos", hint: "concatenate multiple files" },
      { value: "optimize", label: "Smart Optimize", hint: "compress for Discord/Slack" },
      { value: "denoise", label: "AI Audio Denoise", hint: "studio-quality RNNoise" },
    ],
  });
  if (p.isCancel(action)) {
    p.cancel("cancelled");
    process.exit(0);
  }
  return action as FfmpegAction;
}

// ─── ImageMagick Action Selector ────────────────────────────────────
async function selectMagickAction(): Promise<MagickAction> {
  const action = await p.select({
    message: pc.dim("Select an action"),
    options: [
      { value: "convert", label: "Convert Image", hint: "single file" },
      { value: "bulk-convert", label: "Bulk Convert", hint: "full directory" },
      { value: "smart-scale", label: "Smart Scale", hint: "Lanczos sharp resizing" },
      { value: "icon-bundle", label: "Icon Bundle", hint: ".ico + .icns" },
      { value: "web-optimize", label: "Web Optimize", hint: "compress and strip metadata" },
    ],
  });
  if (p.isCancel(action)) {
    p.cancel("cancelled");
    process.exit(0);
  }
  return action as MagickAction;
}

// ─── Format Selectors ───────────────────────────────────────────────
async function selectVideoFormat(): Promise<string> {
  const fmt = await p.select({
    message: pc.dim("Select output video format"),
    options: [
      { value: "mp4", label: "MP4", hint: "H.264 / AAC" },
      { value: "mkv", label: "MKV", hint: "Matroska" },
      { value: "mov", label: "MOV", hint: "QuickTime" },
      { value: "avi", label: "AVI", hint: "AVI" },
      { value: "webm", label: "WEBM", hint: "VP9 / Opus" },
    ],
  });
  if (p.isCancel(fmt)) {
    p.cancel("cancelled");
    process.exit(0);
  }
  return fmt as string;
}

async function selectAudioFormat(): Promise<string> {
  const fmt = await p.select({
    message: pc.dim("Select audio output format"),
    options: [
      { value: "mp3", label: "MP3", hint: "320kbps" },
      { value: "wav", label: "WAV", hint: "PCM 16-bit" },
    ],
  });
  if (p.isCancel(fmt)) {
    p.cancel("cancelled");
    process.exit(0);
  }
  return fmt as string;
}

async function selectImageFormat(): Promise<string> {
  const fmt = await p.select({
    message: pc.dim("Select output image format"),
    options: [
      { value: "png", label: "PNG", hint: "lossless" },
      { value: "jpg", label: "JPG", hint: "lossy, smaller" },
      { value: "webp", label: "WEBP", hint: "modern, small" },
      { value: "avif", label: "AVIF", hint: "next-gen compression" },
    ],
  });
  if (p.isCancel(fmt)) {
    p.cancel("cancelled");
    process.exit(0);
  }
  return fmt as string;
}

// ─── Output Prompt (pre-populated with an absolute path) ────────────
async function askOutput(
  defaultPath: string,
  message = "Output path",
): Promise<string> {
  const out = await p.text({
    message: pc.dim(`${message}  .  press Enter to accept`),
    initialValue: defaultPath,
    validate(value) {
      if (!value || value.trim().length === 0) return "Path is required";
      return;
    },
  });
  if (p.isCancel(out)) {
    p.cancel("cancelled");
    process.exit(0);
  }
  const cleaned = (out as string).trim().replace(/^:/, "");
  return resolve(cleaned);
}

// ─── Confirm / Continue ────────────────────────────────────────────
async function askContinue(): Promise<boolean> {
  const val = await p.confirm({
    message: pc.dim("Perform another operation?"),
    active: "Yes",
    inactive: "No, exit",
  });
  if (p.isCancel(val)) {
    p.cancel("cancelled");
    process.exit(0);
  }
  return val as boolean;
}

// ─── FFmpeg Flow ────────────────────────────────────────────────────
async function ffmpegFlow(): Promise<void> {
  const action = await selectFfmpegAction();
  p.log.step(pc.dim(action));

  let inputFile: string;
  let fmt: string | undefined;
  let outputPath: string;

  switch (action) {
    case "convert": {
      inputFile = await fileBrowser({
        message: "Select input video file",
        allowedExtensions: VIDEO_EXTS,
      });
      fmt = await selectVideoFormat();
      outputPath = defaultOutputPath(inputFile, action, fmt);
      outputPath = await askOutput(outputPath);

      await runFfmpegWithFeedback({
        action,
        input: inputFile,
        output: outputPath,
        format: fmt as VideoFormat,
      });
      break;
    }

    case "trim": {
      inputFile = await fileBrowser({
        message: "Select input video or audio file",
        allowedExtensions: [...VIDEO_EXTS, ...AUDIO_EXTS],
      });

      // Show media duration as reference
      const dur = await getMediaDuration(inputFile);
      const durationStr = dur !== null ? formatSeconds(dur) : null;

      let trimStart = "0";
      let trimEnd = "";
      let confirmed = false;

      while (!confirmed) {
        // ── Start time (defaults to 0 when left empty) ──
        const resultStart = await p.text({
          message: `Start time${durationStr ? pc.dim(`  (duration: ${durationStr})`) : ""}`,
          placeholder: trimStart,
          validate(value) {
            if (value && !validateTimestamp(value)) return "Use HH:MM:SS or seconds (e.g. 90)";
            return;
          },
        });
        if (p.isCancel(resultStart)) { p.cancel("cancelled"); process.exit(0); }
        if (resultStart) trimStart = resultStart;
        // else keep previous (default "0" on first pass)

        // ── End time ──
        const resultEnd = await p.text({
          message: `End time${durationStr ? pc.dim(`  (duration: ${durationStr})`) : ""}`,
          placeholder: trimEnd || durationStr || "(required)",
          validate(value) {
            if (!value && !trimEnd) return "End time is required";
            if (value && !validateTimestamp(value)) return "Use HH:MM:SS or seconds (e.g. 90)";
            return;
          },
        });
        if (p.isCancel(resultEnd)) { p.cancel("cancelled"); process.exit(0); }
        if (resultEnd) trimEnd = resultEnd;
        // else keep previous value

        // Validate start < end
        const rangeErr = validateTrimRange(trimStart, trimEnd);
        if (rangeErr) {
          p.log.error(pc.red(`  ${rangeErr}`));
          const retry = await p.confirm({
            message: "Adjust values?",
            initialValue: true,
          });
          if (p.isCancel(retry)) { p.cancel("cancelled"); process.exit(0); }
          if (retry) continue;
          return; // back to main loop
        }

        // ── Confirm with back/forth navigation ──
        const choice = await p.select({
          message: `Trim from ${pc.cyan(trimStart)} → ${pc.cyan(trimEnd)}`,
          options: [
            { value: "confirm", label: "Confirm & Trim" },
            { value: "back", label: "Adjust values", hint: "go back" },
            { value: "cancel", label: "Cancel" },
          ],
        });
        if (p.isCancel(choice)) { p.cancel("cancelled"); process.exit(0); }

        if (choice === "confirm") confirmed = true;
        // "back" → loop continues with previous values as placeholders
      }

      const inputExt = extname(inputFile).slice(1);
      outputPath = defaultOutputPath(inputFile, action, inputExt);
      outputPath = await askOutput(outputPath);

      await runFfmpegWithFeedback({
        action,
        input: inputFile,
        output: outputPath,
        trimStart,
        trimEnd,
      });
      break;
    }

    case "extract-audio": {
      inputFile = await fileBrowser({
        message: "Select input video or audio file",
        allowedExtensions: [...VIDEO_EXTS, ...AUDIO_EXTS],
      });
      fmt = await selectAudioFormat();
      outputPath = defaultOutputPath(inputFile, action, fmt);
      outputPath = await askOutput(outputPath);

      await runFfmpegWithFeedback({
        action,
        input: inputFile,
        output: outputPath,
        format: fmt as AudioFormat,
      });
      break;
    }

    case "strip-audio": {
      inputFile = await fileBrowser({
        message: "Select input video file",
        allowedExtensions: VIDEO_EXTS,
      });

      const keepOriginal = await p.confirm({
        message: pc.dim("Save as a separate file?"),
        active: "Yes, keep original",
        inactive: "No, overwrite",
      });
      if (p.isCancel(keepOriginal)) {
        p.cancel("cancelled");
        process.exit(0);
      }

      if (keepOriginal) {
        outputPath = defaultOutputPath(inputFile, action);
        outputPath = await askOutput(outputPath);
        await runFfmpegWithFeedback({ action, input: inputFile, output: outputPath });
      } else {
        await runFfmpegWithFeedback({ action, input: inputFile });
      }
      break;
    }

    case "make-gif": {
      inputFile = await fileBrowser({
        message: "Select input video file",
        allowedExtensions: VIDEO_EXTS,
      });

      const g = await p.group(
        {
          trimStart: () =>
            p.text({
              message: pc.dim("Start time"),
              placeholder: "00:00:00  or  0 (seconds)",
              validate(value) {
                if (!value) return "Start time is required";
                if (!validateTimestamp(value)) return "Use HH:MM:SS or seconds (e.g. 90)";
                return;
              },
            }),
          trimEnd: () =>
            p.text({
              message: pc.dim("End time"),
              placeholder: "00:00:10  or  10 (seconds)",
              validate(value) {
                if (!value) return "End time is required";
                if (!validateTimestamp(value)) return "Use HH:MM:SS or seconds (e.g. 90)";
                return;
              },
            }),
          fps: () =>
            p.text({
              message: pc.dim("Frames per second"),
              placeholder: "15",
              initialValue: "15",
              validate(value) {
                if (!value) return;
                const n = Number(value);
                if (Number.isNaN(n) || n < 1 || n > 60) return "FPS must be between 1 and 60";
                return;
              },
            }),
        },
        {
          onCancel: () => {
            p.cancel("cancelled");
            process.exit(0);
          },
        },
      );

      // Validate that start < end before proceeding
      const gifRangeError = validateTrimRange(g.trimStart, g.trimEnd);
      if (gifRangeError) {
        p.log.error(pc.red(`  ${gifRangeError}`));
        return; // back to main loop
      }

      outputPath = defaultOutputPath(inputFile, action);
      outputPath = await askOutput(outputPath);

      await runFfmpegWithFeedback({
        action,
        input: inputFile,
        output: outputPath,
        trimStart: g.trimStart,
        trimEnd: g.trimEnd,
        fps: Number(g.fps) || 15,
      });
      break;
    }

    // ─── Media Info ───────────────────────────────────────────────────
    case "info": {
      inputFile = await fileBrowser({
        message: "Select video or audio file",
        allowedExtensions: [...VIDEO_EXTS, ...AUDIO_EXTS],
      });

      await runFfmpegWithFeedback({ action: "info", input: inputFile });
      break;
    }

    // ─── Bulk Video Convert ───────────────────────────────────────────
    case "bulk-convert": {
      inputFile = await directoryBrowser({
        message: "Select directory containing videos",
      });
      fmt = await selectVideoFormat();

      const defaultOutDir = resolve(inputFile, fmt as string);
      const outDir = await p.text({
        message: pc.dim("Output directory  .  press Enter to accept"),
        initialValue: defaultOutDir,
        validate(value) {
          if (!value || value.trim().length === 0) return "Directory path is required";
          return;
        },
      });
      if (p.isCancel(outDir)) { p.cancel("cancelled"); process.exit(0); }

      await runFfmpegWithFeedback({
        action: "bulk-convert",
        input: inputFile,
        output: resolve((outDir as string).trim()),
        format: fmt as VideoFormat,
      });
      break;
    }

    // ─── Join Videos ──────────────────────────────────────────────────
    case "join": {
      p.log.step(pc.dim("Select files in order (at least 2)"));

      const videoFiles: string[] = [];

      // First 2 files: required, add without prompt
      for (let i = 0; i < 2; i++) {
        const f = await fileBrowser({
          message: `Select video file #${i + 1}`,
          allowedExtensions: VIDEO_EXTS,
        });
        videoFiles.push(f);
      }

      // Optional additional files
      let addMore = true;
      while (addMore) {
        const more = await p.confirm({
          message: pc.dim(`Add another file? (${videoFiles.length} selected)`),
          initialValue: false,
        });
        if (p.isCancel(more)) { p.cancel("cancelled"); process.exit(0); }
        if (!more) break;

        const f = await fileBrowser({
          message: `Select video file #${videoFiles.length + 1}`,
          allowedExtensions: VIDEO_EXTS,
        });
        videoFiles.push(f);
      }

      // Default output: next to first file
      const firstDir = dirname(videoFiles[0]);
      const firstBase = basename(videoFiles[0], extname(videoFiles[0]));
      const defaultOut = resolve(firstDir, `${firstBase}_joined.mp4`);

      outputPath = await askOutput(defaultOut, "Output path for joined file");

      await runFfmpegWithFeedback({
        action: "join",
        input: videoFiles[0],
        inputs: videoFiles,
        output: outputPath,
      });
      break;
    }

    // ─── Smart Optimize for Platform ─────────────────────────────────
    case "optimize": {
      inputFile = await fileBrowser({
        message: "Select video file to compress",
        allowedExtensions: VIDEO_EXTS,
      });

      const platform = await p.select({
        message: pc.dim("Target platform"),
        options: [
          { value: "discord", label: "Discord Free", hint: "target 9.5 MB (limit 10 MB)" },
          { value: "nitro", label: "Discord Nitro / Slack", hint: "target 48 MB (limit 50 MB)" },
        ],
      });
      if (p.isCancel(platform)) { p.cancel("cancelled"); process.exit(0); }

      const plat = platform as string;
      const platSuffix = plat === "nitro" ? "nitro" : "discord";
      const baseName = basename(inputFile, extname(inputFile));
      const defaultOut = resolve(dirname(inputFile), `${baseName}_optimized_${platSuffix}.mp4`);

      outputPath = await askOutput(defaultOut, "Output path");

      await runFfmpegWithFeedback({
        action: "optimize",
        input: inputFile,
        output: outputPath,
        platform: plat,
      });
      break;
    }

    // ─── AI Audio Denoise ────────────────────────────────────────────
    case "denoise": {
      inputFile = await fileBrowser({
        message: "Select video or audio file to denoise",
        allowedExtensions: [...VIDEO_EXTS, ...AUDIO_EXTS],
      });

      const baseName = basename(inputFile, extname(inputFile));
      const ext = extname(inputFile);
      const defaultOut = resolve(dirname(inputFile), `${baseName}_denoised${ext}`);

      outputPath = await askOutput(defaultOut, "Output path");

      await runFfmpegWithFeedback({
        action: "denoise",
        input: inputFile,
        output: outputPath,
      });
      break;
    }
  }
}

// ─── ImageMagick Flow ───────────────────────────────────────────────
async function magickFlow(): Promise<void> {
  const action = await selectMagickAction();
  p.log.step(pc.dim(action));

  let inputPath: string;
  let fmt: string | undefined;
  let outputPath: string;

  switch (action) {
    case "convert": {
      inputPath = await fileBrowser({
        message: "Select input image file",
        allowedExtensions: IMAGE_EXTS,
      });
      fmt = await selectImageFormat();
      outputPath = defaultOutputPath(inputPath, action, fmt);
      outputPath = await askOutput(outputPath);

      await runMagickWithFeedback({
        action,
        input: inputPath,
        output: outputPath,
        format: fmt as ImageFormat,
      });
      break;
    }

    case "bulk-convert": {
      inputPath = await directoryBrowser({
        message: "Select directory containing images",
      });
      fmt = await selectImageFormat();

      const defaultOutDir = resolve(inputPath, fmt as string);
      const outDir = await p.text({
        message: pc.dim("Output directory  .  press Enter to accept"),
        initialValue: defaultOutDir,
        validate(value) {
          if (!value || value.trim().length === 0) return "Directory path is required";
          return;
        },
      });
      if (p.isCancel(outDir)) {
        p.cancel("cancelled");
        process.exit(0);
      }

      await runMagickWithFeedback({
        action,
        input: inputPath,
        output: resolve((outDir as string).trim()),
        format: fmt as ImageFormat,
      });
      break;
    }

    case "smart-scale": {
      inputPath = await fileBrowser({
        message: "Select input image file",
        allowedExtensions: IMAGE_EXTS,
      });

      const scale = await p.text({
        message: pc.dim("Scale dimensions"),
        placeholder: "50%  or  1920x1080  or  x1080",
        validate(value) {
          if (!value) return "Scale is required";
          if (!validateScale(value)) return 'Use format: 50%, 1920x1080, x1080, or 1920x';
          return;
        },
      });
      if (p.isCancel(scale)) {
        p.cancel("cancelled");
        process.exit(0);
      }

      outputPath = defaultOutputPath(inputPath, action);
      outputPath = await askOutput(outputPath);

      await runMagickWithFeedback({
        action,
        input: inputPath,
        output: outputPath,
        scale: (scale as string).trim(),
      });
      break;
    }

    case "icon-bundle": {
      inputPath = await fileBrowser({
        message: "Select high-res source image (1024x1024+ recommended)",
        allowedExtensions: IMAGE_EXTS,
      });

      outputPath = defaultOutputPath(inputPath, action);
      outputPath = await askOutput(outputPath, "Output path for .ico");

      await runMagickWithFeedback({
        action,
        input: inputPath,
        output: outputPath,
      });
      break;
    }

    case "web-optimize": {
      inputPath = await fileBrowser({
        message: "Select input image file",
        allowedExtensions: IMAGE_EXTS,
      });

      const q = await p.text({
        message: pc.dim("Quality (1-100)"),
        placeholder: "85",
        initialValue: "85",
        validate(value) {
          if (!value) return;
          const n = Number(value);
          if (Number.isNaN(n) || n < 1 || n > 100) return "Quality must be between 1 and 100";
          return;
        },
      });
      if (p.isCancel(q)) {
        p.cancel("cancelled");
        process.exit(0);
      }

      outputPath = defaultOutputPath(inputPath, action);
      outputPath = await askOutput(outputPath);

      await runMagickWithFeedback({
        action,
        input: inputPath,
        output: outputPath,
        quality: Number((q as string).trim()) || 85,
        format: "webp",
      });
      break;
    }
  }
}

// ─── Main Interactive Loop ──────────────────────────────────────────
export async function runInteractive(): Promise<void> {
  banner();

  let keepGoing = true;
  while (keepGoing) {
    const category = await selectCategory();
    const tool = CATEGORY_TO_TOOL[category];

    if (tool === "ffmpeg") {
      await ffmpegFlow();
    } else {
      await magickFlow();
    }

    keepGoing = await askContinue();
    if (keepGoing) {
      console.log(pc.dim("  ."));
      console.log();
    }
  }

  p.log.success(pc.green("done  see you next time"));
}
