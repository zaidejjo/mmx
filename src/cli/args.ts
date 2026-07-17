import type { ParsedArgs } from "../types";

/**
 * Minimalist argument parser -- no external deps.
 * Returns null when no relevant flags are found (signals interactive mode).
 */
export function parseArgs(argv: string[]): ParsedArgs | null {
  if (argv.length === 0) return null;

  const args: ParsedArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];

    switch (flag) {
      case "--tool":
      case "-t": {
        const val = argv[++i];
        if (!val || val.startsWith("-")) {
          console.error("error: --tool requires a value (ffmpeg or magick)");
          process.exit(1);
        }
        if (val !== "ffmpeg" && val !== "magick") {
          console.error(`error: unknown tool "${val}". Use ffmpeg or magick.`);
          process.exit(1);
        }
        args.tool = val;
        break;
      }

      case "--action":
      case "-a": {
        const val = argv[++i];
        if (!val || val.startsWith("-")) {
          console.error("error: --action requires a value");
          process.exit(1);
        }
        args.action = val as ParsedArgs["action"];
        break;
      }

      case "--input":
      case "-i": {
        const val = argv[++i];
        if (!val || val.startsWith("-")) {
          console.error("error: --input requires a file path");
          process.exit(1);
        }
        args.input = val;
        break;
      }

      case "--output":
      case "-o": {
        const val = argv[++i];
        if (!val || val.startsWith("-")) {
          console.error("error: --output requires a file path");
          process.exit(1);
        }
        args.output = val;
        break;
      }

      case "--format":
      case "-f": {
        const val = argv[++i];
        if (!val || val.startsWith("-")) {
          console.error("error: --format requires a value");
          process.exit(1);
        }
        args.format = val.toLowerCase();
        break;
      }

      case "--quality":
      case "-q": {
        const val = argv[++i];
        if (!val || val.startsWith("-")) {
          console.error("error: --quality requires a number");
          process.exit(1);
        }
        const num = Number(val);
        if (Number.isNaN(num) || num < 1 || num > 100) {
          console.error("error: --quality must be a number between 1 and 100");
          process.exit(1);
        }
        args.quality = num;
        break;
      }

      case "--trim-start": {
        const val = argv[++i];
        if (!val || val.startsWith("-")) {
          console.error("error: --trim-start requires a timestamp (HH:MM:SS or seconds)");
          process.exit(1);
        }
        args.trimStart = val;
        break;
      }

      case "--trim-end": {
        const val = argv[++i];
        if (!val || val.startsWith("-")) {
          console.error("error: --trim-end requires a timestamp (HH:MM:SS or seconds)");
          process.exit(1);
        }
        args.trimEnd = val;
        break;
      }

      case "--scale":
      case "-s": {
        const val = argv[++i];
        if (!val || val.startsWith("-")) {
          console.error("error: --scale requires a value (e.g. 50% or 1920x1080)");
          process.exit(1);
        }
        args.scale = val;
        break;
      }

      case "--fps": {
        const val = argv[++i];
        if (!val || val.startsWith("-")) {
          console.error("error: --fps requires a number");
          process.exit(1);
        }
        const num = Number(val);
        if (Number.isNaN(num) || num < 1) {
          console.error("error: --fps must be a positive number");
          process.exit(1);
        }
        args.fps = num;
        break;
      }

      case "--ascii": {
        args.ascii = true;
        break;
      }

      case "--help":
      case "-h":
        args.help = true;
        break;

      default:
        if (flag.startsWith("--") || flag.startsWith("-")) {
          console.warn(`warning: unknown flag ${flag}`);
        }
        break;
    }
  }

  // If only help was requested, return early
  if (args.help) return args;

  // If no tool/action flags were present, treat as interactive
  if (!args.tool) return null;

  return args;
}
