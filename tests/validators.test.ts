/**
 * Unit tests for validators — ran with bun:test.
 *
 * Focuses on validateTrimRange (added to prevent start >= end) and
 * validateTimestamp (used by the interactive prompts).
 */

import { describe, expect, test } from "bun:test";
import {
  validateTimestamp,
  validateTrimRange,
  validateScale,
  isExistingFile,
  isExistingDirectory,
  getExtension,
} from "../src/utils/validators";

// ─── validateTrimRange ───────────────────────────────────────────────

describe("validateTrimRange", () => {
  // --- Valid ranges ----------------------------------------------------

  test("accepts HH:MM:SS start before end", () => {
    expect(validateTrimRange("00:01:00", "00:02:00")).toBeNull();
  });

  test("accepts raw seconds start before end", () => {
    expect(validateTrimRange("10", "20")).toBeNull();
  });

  test("accepts decimal seconds", () => {
    expect(validateTrimRange("1.5", "10.75")).toBeNull();
  });

  test("accepts mixed formats (seconds vs HH:MM:SS)", () => {
    expect(validateTrimRange("30", "00:01:00")).toBeNull();
  });

  test("accepts HH:MM (no seconds) start before end", () => {
    expect(validateTrimRange("00:01", "00:02")).toBeNull();
  });

  test("accepts large ranges", () => {
    expect(validateTrimRange("00:00:01", "01:00:00")).toBeNull();
  });

  test("accepts very small difference (sub-second)", () => {
    expect(validateTrimRange("0", "0.5")).toBeNull();
  });

  // --- Invalid ranges --------------------------------------------------

  test("rejects start equal to end (HH:MM:SS)", () => {
    expect(validateTrimRange("00:01:30", "00:01:30")).toBe(
      "Start time must be before end time",
    );
  });

  test("rejects start after end (HH:MM:SS)", () => {
    expect(validateTrimRange("00:05:00", "00:01:00")).toBe(
      "Start time must be before end time",
    );
  });

  test("rejects start after end (raw seconds)", () => {
    expect(validateTrimRange("50", "25")).toBe(
      "Start time must be before end time",
    );
  });

  test("rejects start equal to end (raw seconds)", () => {
    expect(validateTrimRange("30", "30")).toBe(
      "Start time must be before end time",
    );
  });

  test("rejects start after end (mixed formats)", () => {
    expect(validateTrimRange("00:02:00", "30")).toBe(
      "Start time must be before end time",
    );
  });

  // --- Invalid inputs (should return null — let other validators handle) -

  test("returns null for non-timestamp start", () => {
    expect(validateTrimRange("abc", "00:01:00")).toBeNull();
  });

  test("returns null for non-timestamp end", () => {
    expect(validateTrimRange("00:01:00", "xyz")).toBeNull();
  });

  test("returns null when both inputs are invalid", () => {
    expect(validateTrimRange("foo", "bar")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(validateTrimRange("", "00:01:00")).toBeNull();
  });

  test("returns null for negative numbers", () => {
    expect(validateTrimRange("-10", "10")).toBeNull();
  });
});

// ─── validateTimestamp ────────────────────────────────────────────────

describe("validateTimestamp", () => {
  test("returns normalized string for raw seconds", () => {
    const result = validateTimestamp("90");
    expect(result).toBe("00:01:30.00");
  });

  test("returns normalized string for decimal seconds", () => {
    const result = validateTimestamp("90.5");
    expect(result).toBe("00:01:30.50");
  });

  test("returns normalized string for HH:MM:SS (appends .00)", () => {
    const result = validateTimestamp("01:30:45");
    expect(result).toBe("01:30:45.00");
  });

  test("accepts HH:MM (no seconds) and pads seconds", () => {
    const result = validateTimestamp("01:30");
    expect(result).toBe("01:30:00.00");
  });

  test("handles single-digit hour and appends .00 to seconds", () => {
    const result = validateTimestamp("9:05:15");
    expect(result).toBe("09:05:15.00");
  });

  test("accepts HH:MM:SS.mmm", () => {
    const result = validateTimestamp("00:01:30.500");
    expect(result).toBe("00:01:30.500"); // length-preserving; padStart(5) for seconds only
  });

  test("rejects invalid format", () => {
    expect(validateTimestamp("abc")).toBeNull();
  });

  test("accepts hours beyond 23 (valid for long videos)", () => {
    // HH:MM:SS format allows hours > 23 for videos longer than a day
    const result = validateTimestamp("25:00:00");
    expect(result).not.toBeNull();
    expect(result).toBe("25:00:00.00");
  });

  test("rejects malformed timestamp with wrong delimiters", () => {
    expect(validateTimestamp("12-30-00")).toBeNull();
  });

  test("rejects random string", () => {
    expect(validateTimestamp("12:345")).toBeNull();
  });

  test("rejects negative seconds notation", () => {
    expect(validateTimestamp("-00:01:00")).toBeNull();
  });
});

// ─── validateScale ────────────────────────────────────────────────────

describe("validateScale", () => {
  test("accepts percentage", () => {
    expect(validateScale("50%")).toBeTrue();
  });

  test("accepts WxH format", () => {
    expect(validateScale("1920x1080")).toBeTrue();
    expect(validateScale("1920X1080")).toBeTrue();
  });

  test("accepts xH format (auto width)", () => {
    expect(validateScale("x1080")).toBeTrue();
  });

  test("accepts Wx format (auto height)", () => {
    expect(validateScale("1920x")).toBeTrue();
  });

  test("rejects plain number", () => {
    expect(validateScale("1080")).toBeFalse();
  });

  test("rejects empty string", () => {
    expect(validateScale("")).toBeFalse();
  });

  test("rejects non-scale text", () => {
    expect(validateScale("big")).toBeFalse();
  });
});

// ─── getExtension ─────────────────────────────────────────────────────

describe("getExtension", () => {
  test("extracts lowercase extension", () => {
    expect(getExtension("photo.JPG")).toBe("jpg");
  });

  test("returns empty string for no extension", () => {
    expect(getExtension("Makefile")).toBe("");
  });

  test("extracts from path with directories", () => {
    expect(getExtension("/path/to/file.mp4")).toBe("mp4");
  });
});

// ─── isExistingFile / isExistingDirectory ────────────────────────────

describe("isExistingFile", () => {
  test("returns false for non-existent path", () => {
    expect(isExistingFile("/nonexistent/path/file.txt")).toBeFalse();
  });

  test("returns false for empty string", () => {
    expect(isExistingFile("")).toBeFalse();
  });
});

describe("isExistingDirectory", () => {
  test("returns false for non-existent path", () => {
    expect(isExistingDirectory("/nonexistent/path")).toBeFalse();
  });

  test("returns false for empty string", () => {
    expect(isExistingDirectory("")).toBeFalse();
  });
});
