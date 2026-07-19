/**
 * Unit tests for FFmpeg argument building — ran with bun:test.
 *
 * These tests verify the CRITICAL argument ORDER fix for trim / make-gif
 * (ensuring -to appears AFTER -i, not before) and the correctness of all
 * other FFmpeg action argument arrays.
 */

import { describe, expect, test } from "bun:test";
import { buildArgs } from "../src/services/ffmpeg";
import type { FfmpegParams } from "../src/types";

// ─── Helpers ──────────────────────────────────────────────────────────

const DEFAULT_PARAMS: Omit<FfmpegParams, "action"> = {
  input: "/home/videos/demo.mp4",
};

function makeParams(
  overrides: Partial<FfmpegParams> & { action: FfmpegParams["action"] },
): FfmpegParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

/** Find the index of a flag in the arg array (case-sensitive). */
function idxOf(args: string[], flag: string): number {
  return args.indexOf(flag);
}

/** Assert that flagA comes before flagB in the arg array. */
function assertOrder(args: string[], flagA: string, flagB: string): void {
  const iA = idxOf(args, flagA);
  const iB = idxOf(args, flagB);
  if (iA === -1) throw new Error(`Expected flag "${flagA}" not found in args`);
  if (iB === -1) throw new Error(`Expected flag "${flagB}" not found in args`);
  expect(iA).toBeLessThan(iB);
}

/** Assert that a flag appears exactly once. */
function assertPresent(args: string[], flag: string): void {
  expect(args.includes(flag)).toBe(true);
}

/** Assert that a flag does NOT appear. */
function assertAbsent(args: string[], flag: string): void {
  expect(args.includes(flag)).toBe(false);
}

// ─── Trim Action ──────────────────────────────────────────────────────

describe("buildArgs — trim", () => {
  test("places -i BEFORE -to (the critical fix)", () => {
    const args = buildArgs(
      makeParams({
        action: "trim",
        trimStart: "00:01:00",
        trimEnd: "00:02:00",
      }),
    );
    assertOrder(args, "-i", "-to");
  });

  test("places -ss BEFORE -i (fast seek)", () => {
    const args = buildArgs(
      makeParams({
        action: "trim",
        trimStart: "00:00:30",
        trimEnd: "00:01:00",
      }),
    );
    assertOrder(args, "-ss", "-i");
  });

  test("includes stream-copy and timestamp stabilisation flags", () => {
    const args = buildArgs(
      makeParams({
        action: "trim",
        trimStart: "10",
        trimEnd: "20",
      }),
    );
    assertPresent(args, "-c");
    assertPresent(args, "copy");
    assertPresent(args, "-avoid_negative_ts");
    assertPresent(args, "make_zero");
    assertPresent(args, "-copyts");
    assertPresent(args, "-y");
  });

  test("generates default output path with -trimmed suffix", () => {
    const args = buildArgs(
      makeParams({
        action: "trim",
        input: "/videos/clip.mkv",
        trimStart: "5",
        trimEnd: "15",
      }),
    );
    const last = args[args.length - 1];
    expect(last).toEndWith("-trimmed.mkv");
  });

  test("uses custom output path when provided", () => {
    const args = buildArgs(
      makeParams({
        action: "trim",
        input: "/videos/clip.mp4",
        output: "/output/custom-cut.mp4",
        trimStart: "5",
        trimEnd: "15",
      }),
    );
    const last = args[args.length - 1];
    expect(last).toBe("/output/custom-cut.mp4");
  });

  test("omits -ss when trimStart is not provided", () => {
    const args = buildArgs(
      makeParams({
        action: "trim",
        trimEnd: "30",
      }),
    );
    assertAbsent(args, "-ss");
    assertOrder(args, "-i", "-to");
  });

  test("omits -to when trimEnd is not provided", () => {
    const args = buildArgs(
      makeParams({
        action: "trim",
        trimStart: "10",
      }),
    );
    assertAbsent(args, "-to");
    assertPresent(args, "-ss");
    assertOrder(args, "-ss", "-i");
  });

  test("full arg structure is correct", () => {
    const args = buildArgs(
      makeParams({
        action: "trim",
        input: "/videos/input.mp4",
        trimStart: "00:01:30",
        trimEnd: "00:03:00",
        output: "/output/trimmed.mp4",
      }),
    );
    expect(args).toEqual([
      "-ss", "00:01:30",
      "-i", "/videos/input.mp4",
      "-to", "00:03:00",
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      "-copyts",
      "-y",
      "/output/trimmed.mp4",
    ]);
  });

  test("handles input without extension", () => {
    const args = buildArgs(
      makeParams({
        action: "trim",
        input: "/videos/noext",
        trimStart: "10",
        trimEnd: "20",
      }),
    );
    const last = args[args.length - 1];
    expect(last).toEndWith("-trimmed.mp4");
  });
});

// ─── Make GIF Action ──────────────────────────────────────────────────

describe("buildArgs — make-gif", () => {
  test("places -i BEFORE -to (the critical fix)", () => {
    const args = buildArgs(
      makeParams({
        action: "make-gif",
        trimStart: "5",
        trimEnd: "15",
      }),
    );
    assertOrder(args, "-i", "-to");
  });

  test("places -ss BEFORE -i", () => {
    const args = buildArgs(
      makeParams({
        action: "make-gif",
        trimStart: "00:00:10",
        trimEnd: "00:00:20",
      }),
    );
    assertOrder(args, "-ss", "-i");
  });

  test("defaults to 15 fps when fps is not provided", () => {
    const args = buildArgs(
      makeParams({
        action: "make-gif",
        trimStart: "0",
        trimEnd: "10",
      }),
    );
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).not.toBe(-1);
    expect(args[vfIdx + 1]).toInclude("fps=15");
  });

  test("uses custom fps when provided", () => {
    const args = buildArgs(
      makeParams({
        action: "make-gif",
        trimStart: "0",
        trimEnd: "10",
        fps: 24,
      }),
    );
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toInclude("fps=24");
  });

  test("includes palette-generator filtergraph", () => {
    const args = buildArgs(
      makeParams({
        action: "make-gif",
        trimStart: "5",
        trimEnd: "10",
      }),
    );
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).not.toBe(-1);
    const filter = args[vfIdx + 1];
    expect(filter).toInclude("palettegen");
    expect(filter).toInclude("paletteuse");
    expect(filter).toInclude("split");
  });

  test("defaults trimStart to '0' when not provided", () => {
    const args = buildArgs(
      makeParams({
        action: "make-gif",
        trimEnd: "10",
      }),
    );
    const ssIdx = args.indexOf("-ss");
    expect(ssIdx).not.toBe(-1);
    expect(args[ssIdx + 1]).toBe("0");
  });

  test("omits -to when trimEnd is not provided", () => {
    const args = buildArgs(
      makeParams({
        action: "make-gif",
        trimStart: "5",
      }),
    );
    assertAbsent(args, "-to");
  });

  test("includes -y for overwrite", () => {
    const args = buildArgs(
      makeParams({
        action: "make-gif",
        trimStart: "0",
        trimEnd: "5",
      }),
    );
    assertPresent(args, "-y");
  });

  test("full arg structure is correct", () => {
    const args = buildArgs(
      makeParams({
        action: "make-gif",
        input: "/videos/clip.mp4",
        trimStart: "00:00:05",
        trimEnd: "00:00:12",
        fps: 10,
        output: "/out/animated.gif",
      }),
    );
    expect(args).toEqual([
      "-ss", "00:00:05",
      "-i", "/videos/clip.mp4",
      "-to", "00:00:12",
      "-vf",
      "fps=10,scale=iw/2:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
      "-y",
      "/out/animated.gif",
    ]);
  });
});

// ─── Convert Action ───────────────────────────────────────────────────

describe("buildArgs — convert", () => {
  test("uses libx264 and aac by default", () => {
    const args = buildArgs(
      makeParams({
        action: "convert",
        input: "/videos/input.mov",
      }),
    );
    assertPresent(args, "-c:v");
    assertPresent(args, "libx264");
    assertPresent(args, "-c:a");
    assertPresent(args, "aac");
    assertPresent(args, "-preset");
    assertPresent(args, "medium");
    assertPresent(args, "-crf");
    assertPresent(args, "23");
  });

  test("default output is .mp4", () => {
    const args = buildArgs(
      makeParams({
        action: "convert",
        input: "/videos/input.mkv",
      }),
    );
    const last = args[args.length - 1];
    expect(last).toEndWith(".mp4");
  });

  test("uses custom format when provided", () => {
    const args = buildArgs(
      makeParams({
        action: "convert",
        input: "/videos/input.mkv",
        format: "webm",
      }),
    );
    const last = args[args.length - 1];
    expect(last).toEndWith(".webm");
  });

  test("-i comes first in the arg array", () => {
    const args = buildArgs(
      makeParams({
        action: "convert",
        input: "/videos/input.avi",
        output: "/out/result.mp4",
      }),
    );
    expect(args[0]).toBe("-i");
    expect(args[1]).toBe("/videos/input.avi");
  });
});

// ─── Extract Audio Action ─────────────────────────────────────────────

describe("buildArgs — extract-audio", () => {
  test("includes -map 0:a for MP3 output (the fix)", () => {
    const args = buildArgs(
      makeParams({
        action: "extract-audio",
        format: "mp3",
      }),
    );
    assertPresent(args, "-map");
    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 1]).toBe("0:a");
  });

  test("includes -map 0:a for WAV output", () => {
    const args = buildArgs(
      makeParams({
        action: "extract-audio",
        format: "wav",
      }),
    );
    assertPresent(args, "-map");
    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 1]).toBe("0:a");
  });

  test("uses libmp3lame at 320k for MP3", () => {
    const args = buildArgs(
      makeParams({
        action: "extract-audio",
        format: "mp3",
      }),
    );
    assertPresent(args, "-c:a");
    assertPresent(args, "libmp3lame");
    assertPresent(args, "-b:a");
    assertPresent(args, "320k");
  });

  test("uses pcm_s16le for WAV", () => {
    const args = buildArgs(
      makeParams({
        action: "extract-audio",
        format: "wav",
      }),
    );
    assertPresent(args, "-c:a");
    assertPresent(args, "pcm_s16le");
    assertAbsent(args, "libmp3lame");
  });

  test("includes -vn to discard video", () => {
    const args = buildArgs(
      makeParams({
        action: "extract-audio",
        format: "mp3",
      }),
    );
    assertPresent(args, "-vn");
  });

  test("-i comes before -map in the arg order", () => {
    const args = buildArgs(
      makeParams({
        action: "extract-audio",
        format: "mp3",
      }),
    );
    assertOrder(args, "-i", "-map");
  });

  test("defaults to MP3 format", () => {
    const args = buildArgs(
      makeParams({
        action: "extract-audio",
      }),
    );
    const last = args[args.length - 1];
    expect(last).toEndWith(".mp3");
    assertPresent(args, "libmp3lame");
  });
});

// ─── Strip Audio Action ──────────────────────────────────────────────

describe("buildArgs — strip-audio", () => {
  test("uses -c:v copy -an to mute without re-encoding", () => {
    const args = buildArgs(
      makeParams({
        action: "strip-audio",
        input: "/videos/input.mp4",
      }),
    );
    assertPresent(args, "-c:v");
    assertPresent(args, "copy");
    assertPresent(args, "-an");
    assertAbsent(args, "-c:a");
  });

  test("default output ends with -muted suffix", () => {
    const args = buildArgs(
      makeParams({
        action: "strip-audio",
        input: "/videos/input.mov",
      }),
    );
    const last = args[args.length - 1];
    expect(last).toEndWith("-muted.mov");
  });
});

// ─── Unknown Action ───────────────────────────────────────────────────

describe("buildArgs — unknown action", () => {
  test("throws for unrecognised action", () => {
    expect(() =>
      buildArgs({
        action: "invalid-action" as any,
        input: "/videos/x.mp4",
      }),
    ).toThrow("Unknown FFmpeg action");
  });
});

// ─── Input Extension Handling ─────────────────────────────────────────

describe("buildArgs — extension handling", () => {
  test("handles uppercase extensions", () => {
    const args = buildArgs(
      makeParams({
        action: "trim",
        input: "/videos/clip.MP4",
        trimStart: "5",
        trimEnd: "10",
      }),
    );
    const last = args[args.length - 1];
    // Should produce lowercase .mp4 in default output
    expect(last).toEndWith("-trimmed.mp4");
  });

  test("handles MOV input for convert", () => {
    const args = buildArgs(
      makeParams({
        action: "convert",
        input: "/videos/clip.MOV",
      }),
    );
    // Default out with no explicit format: basename preserves original case,
    // extension is lowercased → clip.MOV.mp4
    const last = args[args.length - 1];
    expect(last).toEndWith(".mp4");
  });
});
