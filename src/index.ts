#!/usr/bin/env bun
/**
 * mmx — Media Manipulation eXpress
 *
 * Hybrid CLI entry point:
 *   • No flags          → Interactive mode (arrow-key navigation via @clack/prompts)
 *   • Flags present     → Direct execution mode (skip prompts, run immediately)
 *   • --help / -h       → Print help screen
 *   • --ascii           → Force ASCII-only icons (no Nerd Font glyphs)
 */

import { parseArgs } from "./cli/args";
import { showHelp, errorText, successText } from "./cli/render";
import { runInteractive } from "./cli/prompts";
import { runFfmpeg } from "./services/ffmpeg";
import { runMagick } from "./services/imagemagick";
import { createSpinner } from "./utils/spinner";
import { configureIcons } from "./utils/icons";
import type { ParsedArgs, FfmpegAction, MagickAction } from "./types";

// ─── Detect FFmpeg / ImageMagick Availability ──────────────────────
async function checkDependencies(): Promise<void> {
  const missing: string[] = [];

  const ffmpegProc = Bun.spawn(["which", "ffmpeg"], { stdio: ["ignore", "ignore", "ignore"] });
  const magickProc = Bun.spawn(["which", "magick"], { stdio: ["ignore", "ignore", "ignore"] });

  const [ffmpegExit, magickExit] = await Promise.all([ffmpegProc.exited, magickProc.exited]);

  if (ffmpegExit !== 0) missing.push("ffmpeg");
  if (magickExit !== 0) missing.push("magick (ImageMagick)");

  if (missing.length > 0) {
    console.error();
    errorText(`Missing required dependencies: ${missing.join(", ")}`);
    console.error("  Install them with your package manager:");
    if (missing.includes("ffmpeg")) console.error("    sudo apt install ffmpeg      (or brew install ffmpeg)");
    if (missing.includes("magick (ImageMagick)"))
      console.error("    sudo apt install imagemagick  (or brew install imagemagick)");
    console.error();
    process.exit(1);
  }
}

// ─── Direct Flag Mode Dispatch (with spinner feedback) ───────────────
async function executeDirect(args: ParsedArgs): Promise<void> {
  const { tool, action, input, output, format, quality, trimStart, trimEnd, fps, scale } = args;

  if (!tool || !action) {
    errorText("Both --tool and --action are required in flag mode.");
    showHelp();
    process.exit(1);
  }

  if (!input) {
    errorText("--input is required.");
    process.exit(1);
  }

  const spin = createSpinner();
  spin.start(`${tool}: ${action} ...`);

  let result;

  if (tool === "ffmpeg") {
    result = await runFfmpeg({
      action: action as FfmpegAction,
      input,
      output,
      format: format as any,
      trimStart,
      trimEnd,
      fps,
    });
  } else {
    result = await runMagick({
      action: action as MagickAction,
      input,
      output,
      format: format as any,
      quality,
      scale,
    });
  }

  if (result.success) {
    spin.stop(`${action} complete  →  ${result.outputPath}`, "ok");
    process.exit(0);
  }

  spin.stop(result.error || `${action} failed`, "error");
  process.exit(1);
}

// ─── Main ───────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args?.help) {
    showHelp();
    process.exit(0);
  }

  const forceAscii = args?.ascii ?? false;
  configureIcons(forceAscii);

  await checkDependencies();

  if (args === null) {
    await runInteractive();
  } else {
    await executeDirect(args);
  }
}

main().catch((err) => {
  console.error();
  errorText(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
