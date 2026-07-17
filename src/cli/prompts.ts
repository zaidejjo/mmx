import * as p from "@clack/prompts";
import pc from "picocolors";
import { basename, extname, resolve, dirname } from "node:path";
import { banner } from "./render";
import { fileBrowser, directoryBrowser } from "./filebrowser";
import { runFfmpeg } from "../services/ffmpeg";
import { runMagick } from "../services/imagemagick";
import { createSpinner } from "../utils/spinner";
import { validateTimestamp, validateScale } from "../utils/validators";
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
        hint: "convert, trim, extract audio, make gif",
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
      { value: "trim", label: "Trim Video", hint: "sub-second accuracy" },
      { value: "extract-audio", label: "Extract Audio", hint: "320kbps MP3 / WAV" },
      { value: "strip-audio", label: "Strip Audio", hint: "mute, no re-encode" },
      { value: "make-gif", label: "Make GIF", hint: "high-quality palette" },
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
        message: "Select input video file",
        allowedExtensions: VIDEO_EXTS,
      });

      const { trimStart, trimEnd } = await p.group(
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
        },
        {
          onCancel: () => {
            p.cancel("cancelled");
            process.exit(0);
          },
        },
      );

      outputPath = defaultOutputPath(inputFile, action, "mp4");
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
