// Shared "which pages, in what order" and "nav info for one page" logic, used by both `build`
// and the live server so a doc set gets the same breadcrumbs, side nav, and prev/next in both.
import { relative, sep } from "node:path";
import type { Doc, NavInfo, NavPage } from "../types.ts";

export function pageKey(mdAbsPath: string, docDir: string): string {
  return relative(docDir, mdAbsPath).replace(/\.md$/, "").split(sep).join("/");
}

// A tour entry may be written as a bare key ("how-to-refund") or as a file name
// ("how-to-refund.md", "./how-to-refund.md"); normalize to the bare key form pageKey() produces.
function normalizeTourEntry(entry: string): string {
  return entry.trim().replace(/^\.\//, "").replace(/\.md$/, "");
}

// The `tour` frontmatter on index.md when present, else alphabetical with index first. Toured
// pages come first, in tour order; any page that exists but is missing from the tour is appended
// after, alphabetically, so no page ever drops out of the nav. Unknown tour entries are ignored.
export function orderPages(docs: Doc[], docDir: string): Doc[] {
  const byKey = new Map(docs.map((d) => [pageKey(d.path, docDir), d] as const));
  const indexDoc = byKey.get("index");
  const tour = indexDoc?.frontmatter.tour;

  if (!tour || tour.length === 0) {
    const order = [...byKey.keys()].sort((a, b) => {
      if (a === "index") return -1;
      if (b === "index") return 1;
      return a.localeCompare(b);
    });
    return order.map((k) => byKey.get(k)!);
  }

  const touredKeys = tour.map(normalizeTourEntry).filter((k) => byKey.has(k));
  if (byKey.has("index") && !touredKeys.includes("index")) touredKeys.unshift("index");

  const touredSet = new Set(touredKeys);
  const remaining = [...byKey.keys()].filter((k) => !touredSet.has(k)).sort();

  return [...touredKeys, ...remaining].map((k) => byKey.get(k)!);
}

// Undefined for a single-page folder, or when doc isn't among pages.
export function navForDoc(
  pages: Doc[],
  doc: Doc,
  docDir: string,
  hrefFor: (d: Doc) => string,
  breadcrumbs: { title: string; href: string }[] = [],
): NavInfo | undefined {
  const idx = pages.findIndex((p) => p === doc);
  if (pages.length <= 1 || idx === -1) return undefined;

  const navPages: NavPage[] = pages.map((p) => ({
    title: p.frontmatter.title ?? pageKey(p.path, docDir),
    href: hrefFor(p),
    current: p === doc,
  }));

  return {
    breadcrumbs,
    pages: navPages,
    prev: idx > 0 ? navPages[idx - 1] : undefined,
    next: idx < navPages.length - 1 ? navPages[idx + 1] : undefined,
  };
}
