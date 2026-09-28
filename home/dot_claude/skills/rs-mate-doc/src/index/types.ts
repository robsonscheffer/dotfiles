// Types for the home index (src/serve/home.ts renders them; collect.ts builds them).
import type { Level } from "../types.ts";

export type IndexKind = "doc set" | "guide" | "brief" | "walk" | "dashboard" | "legacy" | "page";

export const INDEX_KINDS: readonly IndexKind[] = ["doc set", "guide", "brief", "walk", "dashboard", "legacy", "page"];

export interface IndexEntry {
  title: string;
  summary?: string;
  kind: IndexKind;
  level?: Level;
  fresh?: boolean; // undefined when the entry has no claims.yaml to judge freshness from
  updated: number; // epoch ms, newest mtime backing this entry
  href: string;
  pr?: string; // "repo#number", present on walk entries
}
