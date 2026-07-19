import { existsSync, statSync } from "node:fs";

/**
 * Validates that a path points to an existing file.
 */
export function isExistingFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Validates that a path points to an existing directory.
 */
export function isExistingDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Validates a HH:MM:SS or raw-seconds timestamp string.
 * Returns the normalized HH:MM:SS string or null if invalid.
 */
export function validateTimestamp(value: string): string | null {
  // Raw seconds (integer or decimal)
  const secMatch = /^\d+(\.\d+)?$/.exec(value);
  if (secMatch) {
    const total = parseFloat(secMatch[0]);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
  }

  // HH:MM:SS(.xx)?
  const tsMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(value);
  if (tsMatch) {
    const h = tsMatch[1].padStart(2, "0");
    const m = tsMatch[2].padStart(2, "0");
    // Normalise seconds: ensure a decimal part exists for consistency
    const rawS = tsMatch[3];
    const s = rawS === undefined
      ? "00.00"
      : rawS.includes(".")
        ? rawS
        : `${rawS}.00`;
    return `${h}:${m}:${s}`;
  }

  return null;
}

/**
 * Validates a scaling argument: "50%", "1920x1080", "x1080", "1920x".
 */
export function validateScale(value: string): boolean {
  return /^(\d+%|\d+[xX]\d*|\d*[xX]\d+)$/.test(value);
}

/**
 * Converts a timestamp string (HH:MM:SS or raw seconds) to total seconds.
 * Returns NaN if the input is invalid.
 */
function timestampToSeconds(value: string): number {
  // Raw seconds (integer or decimal)
  const secMatch = /^\d+(\.\d+)?$/.exec(value);
  if (secMatch) return parseFloat(secMatch[0]);

  // HH:MM:SS(.xx)?
  const tsMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(value);
  if (tsMatch) {
    const h = parseInt(tsMatch[1], 10);
    const m = parseInt(tsMatch[2], 10);
    const s = tsMatch[3] ? parseFloat(tsMatch[3]) : 0;
    return h * 3600 + m * 60 + s;
  }

  return NaN;
}

/**
 * Validates that trimStart is before trimEnd.
 * Returns an error message if invalid, or null if valid.
 */
export function validateTrimRange(trimStart: string, trimEnd: string): string | null {
  const start = timestampToSeconds(trimStart);
  const end = timestampToSeconds(trimEnd);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null; // Let the individual timestamp validators handle format errors
  }

  if (start >= end) {
    return "Start time must be before end time";
  }

  return null;
}

/**
 * File extension => simple category check.
 */
export function getExtension(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : "";
}

/**
 * Returns a friendly list of image extensions for ImageMagick.
 */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "avif", "tiff", "bmp"];
