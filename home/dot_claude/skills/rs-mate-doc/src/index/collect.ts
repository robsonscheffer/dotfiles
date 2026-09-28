// Builds the home index's entries from registered folders: one entry per doc set (a folder with
// index.md), one entry per loose page (a folder without index.md), one entry per .html file
// (kind legacy). Cached per folder, keyed on that folder's newest top-level mtime, so a repeat
// request with nothing changed on disk skips reading and parsing frontmatter again.
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadLedger } from "../ledger/index.ts";
import type { Frontmatter, Parse } from "../types.ts";
import type { IndexEntry, IndexKind } from "./types.ts";

export interface RegisteredFolder {
  path: string; // absolute realpath
  alias: string;
}

interface CacheEntry {
  mtime: number;
  entries: IndexEntry[];
}

export type HomeCache = Map<string, CacheEntry>;

export function createHomeCache(): HomeCache {
  return new Map();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function claimExpired(claim: { checked_at?: string; ttl_days?: number }, nowMs: number): boolean {
  if (!claim.checked_at || claim.ttl_days === undefined) return false;
  const checkedAt = new Date(claim.checked_at).getTime();
  if (Number.isNaN(checkedAt)) return false;
  return checkedAt + claim.ttl_days * DAY_MS < nowMs;
}

async function freshnessFor(dirAbs: string, nowMs: number): Promise<boolean | undefined> {
  const ledger = await loadLedger(dirAbs);
  if (!ledger) return undefined;
  return !ledger.claims.some((c) => claimExpired(c, nowMs));
}

function extraString(fm: Frontmatter, key: string): string | undefined {
  const value = fm.extra[key];
  return typeof value === "string" ? value : undefined;
}

function kindFor(fm: Frontmatter, fallback: IndexKind): IndexKind {
  const explicit = extraString(fm, "kind");
  if (explicit) return explicit as IndexKind;
  if (fm.shape) return fm.shape as IndexKind;
  return fallback;
}

interface DirListing {
  mdFiles: string[]; // basenames, index.md excluded
  htmlFiles: string[];
  hasIndex: boolean;
  names: string[]; // every top-level file name considered for mtime, including claims.yaml
}

async function listDir(dirAbs: string): Promise<DirListing> {
  const entries = await readdir(dirAbs, { withFileTypes: true });
  const mdFiles: string[] = [];
  const htmlFiles: string[] = [];
  let hasIndex = false;
  const names: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || !entry.isFile()) continue;
    if (entry.name === "index.md") {
      hasIndex = true;
      names.push(entry.name);
      continue;
    }
    if (entry.name === "claims.yaml") {
      names.push(entry.name);
      continue;
    }
    if (entry.name.endsWith(".md")) {
      mdFiles.push(entry.name);
      names.push(entry.name);
    } else if (entry.name.endsWith(".html")) {
      htmlFiles.push(entry.name);
      names.push(entry.name);
    }
  }
  return { mdFiles, htmlFiles, hasIndex, names };
}

async function newestMtime(dirAbs: string, names: string[]): Promise<number> {
  let max = 0;
  for (const name of names) {
    try {
      const st = await stat(join(dirAbs, name));
      if (st.mtimeMs > max) max = st.mtimeMs;
    } catch {
      // removed between readdir and stat; ignore
    }
  }
  return max;
}

async function docSetEntry(folder: RegisteredFolder, parse: Parse, nowMs: number, updated: number): Promise<IndexEntry> {
  const indexPath = join(folder.path, "index.md");
  const src = await readFile(indexPath, "utf8");
  const doc = parse(src, indexPath);
  const fm = doc.frontmatter;
  const fresh = await freshnessFor(folder.path, nowMs);
  return {
    title: fm.title ?? folder.alias,
    summary: fm.summary,
    kind: kindFor(fm, "doc set"),
    level: fm.status,
    fresh,
    updated,
    href: `/${folder.alias}/`,
    pr: extraString(fm, "pr"),
  };
}

async function pageEntry(folder: RegisteredFolder, name: string, parse: Parse): Promise<IndexEntry> {
  const abs = join(folder.path, name);
  const src = await readFile(abs, "utf8");
  const doc = parse(src, abs);
  const fm = doc.frontmatter;
  const st = await stat(abs);
  const base = name.slice(0, -3);
  return {
    title: fm.title ?? base,
    summary: fm.summary,
    kind: kindFor(fm, "page"),
    level: fm.status,
    updated: st.mtimeMs,
    href: `/${folder.alias}/${base}`,
  };
}

const TITLE_TAG_RE = /<title>([^<]*)<\/title>/i;

async function htmlEntry(folder: RegisteredFolder, name: string): Promise<IndexEntry> {
  const abs = join(folder.path, name);
  const src = await readFile(abs, "utf8");
  const match = TITLE_TAG_RE.exec(src);
  const st = await stat(abs);
  return {
    title: match?.[1]?.trim() || name,
    kind: "legacy",
    updated: st.mtimeMs,
    href: `/${folder.alias}/${name}`,
  };
}

async function collectFolderEntries(folder: RegisteredFolder, parse: Parse, nowMs: number): Promise<IndexEntry[]> {
  const listing = await listDir(folder.path);
  const updated = await newestMtime(folder.path, listing.names);

  if (listing.hasIndex) {
    return [await docSetEntry(folder, parse, nowMs, updated)];
  }

  const entries: IndexEntry[] = [];
  for (const name of listing.mdFiles) entries.push(await pageEntry(folder, name, parse));
  for (const name of listing.htmlFiles) entries.push(await htmlEntry(folder, name));
  return entries;
}

// Reads (or reuses) each registered folder's entries, then returns everything flattened, newest
// first. `cache` is per-server-process state, passed in explicitly so tests can assert it is
// actually used (a spy on `parse` sees no second call for an unchanged folder).
export async function collectHomeEntries(
  folders: RegisteredFolder[],
  parse: Parse,
  cache: HomeCache,
  nowMs: number = Date.now(),
): Promise<IndexEntry[]> {
  const all: IndexEntry[] = [];
  for (const folder of folders) {
    const listing = await listDir(folder.path);
    const mtime = await newestMtime(folder.path, listing.names);
    const cached = cache.get(folder.path);
    if (cached && cached.mtime === mtime) {
      all.push(...cached.entries);
      continue;
    }
    const entries = await collectFolderEntries(folder, parse, nowMs);
    cache.set(folder.path, { mtime, entries });
    all.push(...entries);
  }
  return all.sort((a, b) => b.updated - a.updated);
}
