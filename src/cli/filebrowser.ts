/**
 * Interactive file / directory browser with type-to-filter and directory drilling.
 *
 * Uses @clack/prompts' select prompt — its built-in filter-as-you-type
 * provides instant file searching. Selecting a directory drills down;
 * selecting a file (or the "[use this directory]" sentinel) returns.
 *
 * Icons: Nerd Font glyphs when available, clean text-only fallback.
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import { readdirSync, statSync } from "node:fs";
import { resolve, join, dirname, extname, basename } from "node:path";
import { dirIcon, fileIcon, upIcon, dirSuffix, isNerd } from "../utils/icons";

// ─── Types ──────────────────────────────────────────────────────────
export interface FileBrowserOptions {
  /** Prompt message shown above the file list. */
  message: string;
  /** Starting directory (defaults to process.cwd()). */
  currentDir?: string;
  /** Only show files whose extension is in this list (lowercase, no dot). */
  allowedExtensions?: string[];
}

export interface DirBrowserOptions {
  /** Prompt message shown above the directory list. */
  message: string;
  /** Starting directory (defaults to process.cwd()). */
  currentDir?: string;
}

// ─── File Browser (selects a file) ──────────────────────────────────
export async function fileBrowser(opts: FileBrowserOptions): Promise<string> {
  const startDir = resolve(opts.currentDir || process.cwd());
  return browseRecursive(startDir, opts.message, opts.allowedExtensions, false);
}

// ─── Directory Browser (selects a directory) ─────────────────────────
export async function directoryBrowser(opts: DirBrowserOptions): Promise<string> {
  const startDir = resolve(opts.currentDir || process.cwd());
  return browseRecursive(startDir, opts.message, undefined, true);
}

// ─── Label builders ──────────────────────────────────────────────────
function dirLabel(name: string): string {
  return pc.cyan(`${dirIcon()}${name}${dirSuffix()}`);
}

function fileLabel(name: string): string {
  // In Nerd Font mode we show an icon; in ASCII mode we show the bare name
  if (isNerd()) {
    return `${fileIcon()}${name}`;
  }
  return name;
}

function parentLabel(): string {
  if (isNerd()) {
    return `${upIcon()}..`;
  }
  return pc.dim("..");
}

function useDirLabel(): string {
  return pc.bold(pc.green("[ use this directory ]"));
}

// ─── Shared Recursive Browser ───────────────────────────────────────
async function browseRecursive(
  dir: string,
  message: string,
  allowedExt: string[] | undefined,
  selectDirMode: boolean,
): Promise<string> {
  // ── Read directory ───────────────────────────────────────────────
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    p.cancel(pc.red(`cannot read directory: ${dir}`));
    process.exit(1);
  }

  // Skip hidden entries
  entries = entries.filter((e) => !e.startsWith("."));

  // Separate into dirs and files, gathering sizes for files
  const dirs: string[] = [];
  const fileEntries: { name: string; size: number }[] = [];

  for (const entry of entries) {
    try {
      const fullPath = join(dir, entry);
      const s = statSync(fullPath);
      if (s.isDirectory()) {
        dirs.push(entry);
      } else if (s.isFile()) {
        fileEntries.push({ name: entry, size: s.size });
      }
    } catch {
      // skip unreadable entries
    }
  }

  dirs.sort((a, b) => a.localeCompare(b));
  fileEntries.sort((a, b) => a.name.localeCompare(b.name));

  // ── Build option list ────────────────────────────────────────────
  const options: { value: string; label: string; hint?: string }[] = [];

  // "Use this directory" sentinel (only for directory browser)
  if (selectDirMode) {
    options.push({
      value: "__USE_THIS__",
      label: useDirLabel(),
      hint: pc.dim(dir),
    });
  }

  // Parent directory navigation (always shown with a hint)
  if (dir !== "/") {
    options.push({
      value: "__PARENT__",
      label: parentLabel(),
      hint: pc.dim(dirname(dir)),
    });
  }

  // Directory entries
  for (const d of dirs) {
    options.push({
      value: `__DIR__:${d}`,
      label: dirLabel(d),
      hint: pc.dim(""),
    });
  }

  // File entries (filtered by extension when applicable)
  for (const f of fileEntries) {
    const ext = extname(f.name).toLowerCase().slice(1);
    if (allowedExt && allowedExt.length > 0 && !allowedExt.includes(ext)) {
      continue;
    }
    options.push({
      value: `__FILE__:${f.name}`,
      label: fileLabel(f.name),
      hint: pc.dim(formatSize(f.size)),
    });
  }

  // ── Empty-directory guard ────────────────────────────────────────
  if (options.length === 0) {
    p.log.warn(pc.dim(`  empty: ${dir}`));

    if (dir === "/") {
      p.cancel(pc.red("no files available"));
      process.exit(0);
    }

    // Automatically pop up one level
    return browseRecursive(dirname(dir), message, allowedExt, selectDirMode);
  }

  // ── Show the select prompt ───────────────────────────────────────
  const selection = await p.select({
    message: pc.dim(`${message}  .  ${pc.reset(dir)}`),
    options,
  });

  if (p.isCancel(selection)) {
    p.cancel("cancelled");
    process.exit(0);
  }

  const val = selection as string;

  // Handle sentinel values
  if (val === "__USE_THIS__") {
    return dir;
  }

  if (val === "__PARENT__") {
    return browseRecursive(dirname(dir), message, allowedExt, selectDirMode);
  }

  if (val.startsWith("__DIR__:")) {
    const dirName = val.slice("__DIR__:".length).replace(/^:/, "");
    return browseRecursive(join(dir, dirName), message, allowedExt, selectDirMode);
  }

  // It's a file — strip the `__FILE__:` prefix and return the full path
  const fileName = val.slice("__FILE__:".length).replace(/^:/, "");
  return join(dir, fileName);
}

// ─── Size Formatting ────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}
