/**
 * Nerd Font detection & icon selection.
 *
 * Checks environment variables to decide whether Nerd Font glyphs
 * are available. Falls back to clean ASCII on any uncertainty.
 * The user can force ASCII mode with `--ascii` (or by not having
 * Nerd Font env vars configured).
 */

// ─── Icon Set Types ─────────────────────────────────────────────────
export type IconSet = "nerd" | "ascii";
export type IconKind = "dir" | "file" | "video" | "image" | "music" | "up" | "paint";

let detectedSet: IconSet | null = null;
let forcedAscii = false;

// ─── Configuration ──────────────────────────────────────────────────
/** Call once at startup, before any icon lookups. */
export function configureIcons(forceAscii: boolean): void {
  forcedAscii = forceAscii;
  // Reset so next detect() re-evaluates
  detectedSet = null;
}

// ─── Detection ──────────────────────────────────────────────────────
export function detectIconSet(): IconSet {
  if (detectedSet !== null) return detectedSet;

  // 1. Explicit user override
  if (forcedAscii) {
    detectedSet = "ascii";
    return detectedSet;
  }

  // 2. NERD_FONT env var (user can set it in shell profile)
  const nf = process.env.NERD_FONT;
  if (nf === "1" || nf === "true" || nf === "yes" || nf === "y") {
    detectedSet = "nerd";
    return detectedSet;
  }

  // 3. Check known nerd-font-capable terminal emulators
  const termEmu = (process.env.TERMINAL_EMU || "").toLowerCase();
  const termProg = (process.env.TERM_PROGRAM || "").toLowerCase();
  const term = (process.env.TERM || "").toLowerCase();

  const nerdFriendlyTerminals = [
    "kitty", "wezterm", "alacritty", "ghostty",
    "warp", "foot", "st", "urxvt", "tmux",
  ];

  if (
    nerdFriendlyTerminals.some(
      (t) => termEmu.includes(t) || termProg.includes(t) || term.includes(t),
    )
  ) {
    detectedSet = "nerd";
    return detectedSet;
  }

  // 4. Everything else → safe ASCII fallback
  detectedSet = "ascii";
  return detectedSet;
}

// ─── Icon Maps ──────────────────────────────────────────────────────

const NERD_ICONS: Record<IconKind, string> = {
  dir:   "\uF115",   //   nf-fa-folder
  file:  "\uF016",   //   nf-fa-file_o
  video: "\uF008",   //   nf-fa-film
  image: "\uF03E",   //   nf-fa-picture_o
  music: "\uF001",   //   nf-fa-music
  up:    "\uF062",   //   nf-fa-arrow_up
  paint: "\uF1FC",   //   nf-fa-paint-brush
};

// ASCII fallback — empty strings mean "no prefix at all"
const ASCII_ICONS: Record<IconKind, string> = {
  dir:   "",
  file:  "",
  video: "",
  image: "",
  music: "",
  up:    "",
  paint: "",
};

// ─── Public API ─────────────────────────────────────────────────────

/** Return icon glyph for the given kind, or empty string in ASCII mode. */
export function icon(kind: IconKind): string {
  const set = detectIconSet();
  return set === "nerd" ? NERD_ICONS[kind] : ASCII_ICONS[kind];
}

/** Shorthand: get the directory icon with a trailing space if non-empty. */
export function dirIcon(): string {
  const i = icon("dir");
  return i ? `${i}\u00A0` : ""; // nbsp after icon
}

/** Shorthand: get the file icon with a trailing space if non-empty. */
export function fileIcon(): string {
  const i = icon("file");
  return i ? `${i}\u00A0` : "";
}

/** Shorthand: get the up-navigation icon with a trailing space if non-empty. */
export function upIcon(): string {
  const i = icon("up");
  return i ? `${i}\u00A0` : "";
}

/** Return the directory label suffix (always "/" in ASCII, icon in Nerd). */
export function dirSuffix(): string {
  return detectIconSet() === "nerd" ? "" : "/";
}

/** Master switch — are we in Nerd mode? */
export function isNerd(): boolean {
  return detectIconSet() === "nerd";
}
