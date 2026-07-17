# mmx — Media Manipulation eXpress

> The minimalist, blazing-fast media toolkit for your terminal.

[![npm version](https://img.shields.io/npm/v/@zaidejjo/mmx?color=blueviolet&style=flat-square)](https://www.npmjs.com/package/@zaidejjo/mmx)
[![Bun](https://img.shields.io/badge/Powered%20by-Bun-000?style=flat-square&logo=bun)](https://bun.sh)
[![License](https://img.shields.io/npm/l/@zaidejjo/mmx?style=flat-square)]()

**Zero emojis · Auto Nerd Font detection with graceful ASCII fallback · Clean UX abstractions over FFmpeg and ImageMagick**

> **Website:** [mmx-cli.pages.dev](https://mmx-cli.pages.dev)

---

## Installation

Requires [Bun](https://bun.sh) (≥1.0) installed on your system.

```bash
# npm
npm install -g @zaidejjo/mmx

# bun (native)
bun add -g @zaidejjo/mmx

# pnpm
pnpm add -g @zaidejjo/mmx

# yarn
yarn global add @zaidejjo/mmx
```

Once installed, run with:

```bash
mmx
```

The tool bundles to a single 96 KB binary at install time and runs natively on the Bun runtime.

---

## Requirements

| Dependency | Required For | Install (Debian/Ubuntu) | Install (macOS) |
|-----------|-------------|------------------------|-----------------|
| **[FFmpeg](https://ffmpeg.org)** | Video & audio operations (convert, trim, extract, GIF) | `sudo apt install ffmpeg` | `brew install ffmpeg` |
| **[ImageMagick](https://imagemagick.org)** | Image operations (convert, scale, icon bundles, optimize) | `sudo apt install imagemagick` | `brew install imagemagick` |

mmx will check for both dependencies at startup and show a clear install hint if either is missing.

---

## Features

| Category | Actions |
|----------|---------|
| **Video & Audio** | Universal format conversion (MP4, MKV, MOV, AVI, WEBM) · Sub-second trimming · 320 kbps audio extraction · Instant audio stripping (no re-encode) · High-quality palette GIFs |
| **Image Manipulation** | Single & bulk format conversion (PNG, JPG, WEBP, AVIF) · Lanczos smart scaling · Multi-resolution icon bundles (.ico + .icns) · Metadata stripping & lossless-size optimization |
| **Smart UI** | Arrow-key navigation · Type-to-filter file browser with directory drilling · Nerd Font glyphs auto-detected, pure ASCII fallback · Pre-populated smart output paths · Zero emojis — clean, textual, deliberate |

---

## Usage

### Interactive Mode (arrow keys)

Just run `mmx` with no arguments:

```bash
mmx
```

You'll be guided through:

```
?  What would you like to work with?
   >  Video & Audio
      Image Manipulation
```

Select a category, then an action, browse for a file (type to filter, select directories to drill down), and accept or edit the pre-populated output path. That's it.

### Direct Flag Mode

Skip the prompts entirely — useful for scripts or power users:

```bash
mmx --tool magick --action smart-scale -i input.png -s 50% -o output.png
mmx --tool ffmpeg --action convert -i video.mkv -f mp4 -o video.mp4
mmx --tool ffmpeg --action extract-audio -i video.mp4 -f mp3 -o audio.mp3
mmx --tool magick --action icon-bundle -i icon.png -o icon.ico
mmx --tool magick --action web-optimize -i photo.png -q 85
```

### Flags

| Flag | Description |
|------|-------------|
| `--tool, -t` | Tool to use: `ffmpeg` or `magick` |
| `--action, -a` | Action to execute |
| `--input, -i` | Input file or directory |
| `--output, -o` | Output file or directory |
| `--format, -f` | Target format |
| `--quality, -q` | Quality (1-100) |
| `--trim-start` | Trim start timestamp (HH:MM:SS or seconds) |
| `--trim-end` | Trim end timestamp |
| `--scale, -s` | Scale dimensions (e.g. `50%`, `1920x1080`) |
| `--fps` | Frames per second (GIF output) |
| `--ascii` | Force pure ASCII mode (no Nerd Font glyphs) |
| `--help, -h` | Show help screen |

### Nerd Font Detection

mmx automatically detects Nerd Font support by checking these environment variables, in order:

1. `NERD_FONT=1` — explicit user opt-in
2. `TERMINAL_EMU` / `TERM_PROGRAM` / `TERM` — known nerd-friendly terminals (Kitty, WezTerm, Alacritty, Ghostty, Warp, Foot, tmux)

If none match, all icons degrade to clean ASCII — no broken glyphs, no question marks.

To force ASCII mode explicitly:

```bash
mmx --ascii
```

---

## Architecture

```
src/
├── index.ts              # Hybrid entry: interactive (no flags) or direct (flags)
├── types.ts              # Shared types
├── cli/
│   ├── args.ts           # Argument parser (zero deps)
│   ├── filebrowser.ts    # Interactive file browser with directory drilling
│   ├── prompts.ts        # Arrow-key navigation flows
│   └── render.ts         # Banner, status helpers, help screen
├── services/
│   ├── ffmpeg.ts         # FFmpeg command builder + runner
│   └── imagemagick.ts    # ImageMagick command builder + runner
└── utils/
    ├── icons.ts          # Nerd Font detection + icon map
    ├── spinner.ts        # Clack spinner wrapper
    └── validators.ts     # Timestamp, scale, path validators
```

---

## Publishing

```bash
npm publish
```

The `prepublishOnly` hook automatically runs `bun run build`, producing a single 96 KB bundle at `dist/index.js`. Only `dist/` and `package.json` are published.

---

## License

MIT - LICENSE
