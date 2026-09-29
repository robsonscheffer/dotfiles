// Types for the home index (src/serve/home.ts renders them; collect.ts builds them).
import type { Level, Shape } from "../types.ts";

// collect.ts's kindFor() falls back to frontmatter's `shape` when no explicit `kind` extra is
// set, so every Shape value can end up as a kind. This record forces a compile error if Shape
// ever gains or loses a member without this list changing too.
const SHAPE_KINDS_RECORD: Record<Shape, true> = { plain: true, guide: true, brief: true, walk: true };
const SHAPE_KINDS = Object.keys(SHAPE_KINDS_RECORD) as Shape[];

export type IndexKind = Shape | "doc set" | "dashboard" | "legacy" | "page";

export const INDEX_KINDS: readonly IndexKind[] = [...SHAPE_KINDS, "doc set", "dashboard", "legacy", "page"];

export interface IndexEntry {
  title: string;
  summary?: string;
  kind: IndexKind;
  level?: Level;
  fresh?: boolean; // undefined when the entry has no claims.yaml to judge freshness from
  updated: number; // epoch ms, newest mtime backing this entry
  href: string;
  pr?: string; // "repo#number", present on walk entries
  // set when this page or doc set's frontmatter failed to parse; title/kind above are then
  // fallbacks (file or folder name), not read from the broken file.
  frontmatterError?: string;
}
