import pc from "picocolors";
import { icon, isNerd } from "../utils/icons";

// ─── Minimalist Banner (no box borders, no emoji symbols) ────────────
export function banner(): void {
  console.log();
  console.log(pc.cyan(pc.bold("  mmx — media tool")));
  console.log(pc.dim("  Media Manipulation eXpress"));
  console.log(pc.dim("  " + "\u2500".repeat(28)));  // ─
  console.log();
}

// ─── Subtle Separator ────────────────────────────────────────────────
export function divider(label?: string): void {
  if (label) {
    console.log(pc.dim(`  . ${label}`));
  } else {
    console.log(pc.dim("  ."));
  }
}

// ─── Status Helpers (pure text, no emoji/dingbat symbols) ────────────
export function successText(msg: string): void {
  console.log(pc.green(`  ok: ${msg}`));
}

export function errorText(msg: string): void {
  console.log(pc.red(`  error: ${msg}`));
}

export function warningText(msg: string): void {
  console.log(pc.yellow(`  warning: ${msg}`));
}

export function infoText(msg: string): void {
  console.log(pc.dim(`  . ${msg}`));
}

// ─── Help Screen ────────────────────────────────────────────────────
export function showHelp(): void {
  banner();
  console.log(pc.bold("  Usage:"));
  console.log(`    mmx                              ${pc.dim("Interactive mode (arrow keys)")}`);
  console.log(`    mmx --tool <t> --action <a> ...   ${pc.dim("Direct flag mode")}`);
  console.log(`    mmx --help                        ${pc.dim("This help screen")}`);
  console.log();
  console.log(pc.bold("  Flags:"));
  console.log(`    ${pc.cyan("--tool, -t")}        <ffmpeg|magick>   ${pc.dim("Tool selection")}`);
  console.log(`    ${pc.cyan("--action, -a")}       <action>           ${pc.dim("Action for selected tool")}`);
  console.log(`    ${pc.cyan("--input, -i")}        <path>             ${pc.dim("Input file or directory")}`);
  console.log(`    ${pc.cyan("--output, -o")}       <path>             ${pc.dim("Output file or directory")}`);
  console.log(`    ${pc.cyan("--format, -f")}       <fmt>              ${pc.dim("Target format")}`);
  console.log(`    ${pc.cyan("--quality, -q")}      <1-100>            ${pc.dim("Quality percentage")}`);
  console.log(`    ${pc.cyan("--trim-start")}       <time>             ${pc.dim("Trim start (HH:MM:SS or secs)")}`);
  console.log(`    ${pc.cyan("--trim-end")}         <time>             ${pc.dim("Trim end")}`);
  console.log(`    ${pc.cyan("--scale, -s")}        <dim>              ${pc.dim("Scale (e.g. 50%% or 1920x1080)")}`);
  console.log(`    ${pc.cyan("--fps")}              <num>              ${pc.dim("Frames per second (GIF)")}`);
  console.log(`    ${pc.cyan("--ascii")}                               ${pc.dim("Force ASCII-only output")}`);
  console.log(`    ${pc.cyan("--help, -h")}                            ${pc.dim("Show help")}`);
  console.log();
  console.log(pc.bold("  FFmpeg Actions:"));
  console.log(`    convert        ${pc.dim("Universal video converter")}`);
  console.log(`    trim           ${pc.dim("Precise video/audio trimming")}`);
  console.log(`    extract-audio  ${pc.dim("Extract audio to MP3/WAV (320kbps)")}`);
  console.log(`    strip-audio    ${pc.dim("Mute audio (no re-encode)")}`);
  console.log(`    make-gif       ${pc.dim("Convert video to optimized GIF")}`);
  console.log(`    info           ${pc.dim("Show codec, resolution, duration metadata")}`);
  console.log(`    bulk-convert   ${pc.dim("Batch convert all videos in a directory")}`);
  console.log(`    join           ${pc.dim("Join multiple video files into one")}`);
  console.log();
  console.log(pc.bold("  ImageMagick Actions:"));
  console.log(`    convert        ${pc.dim("Single image format conversion")}`);
  console.log(`    bulk-convert   ${pc.dim("Bulk directory image conversion")}`);
  console.log(`    smart-scale    ${pc.dim("Multi-algorithm smart resizing")}`);
  console.log(`    icon-bundle    ${pc.dim("Generate .ico + .icns from source")}`);
  console.log(`    web-optimize   ${pc.dim("Compress & strip metadata")}`);
  console.log();
}
