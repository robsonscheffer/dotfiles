// Auto-generated folder listing: pages (title/summary/status from
// frontmatter) and subfolders. Used when a directory has no index.md.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { THEME_CSS, THEME_TOGGLE_SCRIPT } from "../render/theme.ts";
import type { Parse } from "../types.ts";

export interface FolderEntryPage {
  name: string; // file basename without .md
  title: string;
  summary?: string;
  status?: string;
}

export interface FolderEntrySub {
  name: string;
}

export interface FolderListing {
  pages: FolderEntryPage[];
  subfolders: FolderEntrySub[];
}

export async function collectFolderListing(dirAbs: string, parse: Parse): Promise<FolderListing> {
  const entries = await readdir(dirAbs, { withFileTypes: true });
  const pages: FolderEntryPage[] = [];
  const subfolders: FolderEntrySub[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      subfolders.push({ name: entry.name });
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    if (entry.name === "index.md") continue;
    const abs = join(dirAbs, entry.name);
    const src = await readFile(abs, "utf8");
    const doc = parse(src, abs);
    const name = entry.name.slice(0, -3);
    pages.push({
      name,
      title: doc.frontmatter.title ?? name,
      summary: doc.frontmatter.summary,
      status: doc.frontmatter.status,
    });
  }

  pages.sort((a, b) => a.title.localeCompare(b.title));
  subfolders.sort((a, b) => a.name.localeCompare(b.name));
  return { pages, subfolders };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function renderFolderListing(alias: string, urlPrefix: string, listing: FolderListing): string {
  const subLis = listing.subfolders
    .map((s) => `<li><a href="${esc(urlPrefix)}/${esc(s.name)}/">${esc(s.name)}/</a></li>`)
    .join("\n");
  const pageLis = listing.pages
    .map((p) => {
      const status = p.status ? ` <span class="status-banner status-${esc(p.status)}">${esc(p.status)}</span>` : "";
      const summary = p.summary ? `<p class="doc-summary">${esc(p.summary)}</p>` : "";
      return `<li><a href="${esc(urlPrefix)}/${esc(p.name)}">${esc(p.title)}</a>${status}${summary}</li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(alias)}</title>
<style>${THEME_CSS}</style>
</head>
<body class="no-nav">
<button type="button" class="theme-toggle" aria-label="Toggle color theme">Theme</button>
<div class="layout">
<main>
<header class="doc-header"><h1>${esc(alias)}</h1></header>
<section class="subfolders"><ul>${subLis}</ul></section>
<section class="pages"><ul class="not-verified-list">${pageLis}</ul></section>
</main>
</div>
<script>${THEME_TOGGLE_SCRIPT}</script>
</body>
</html>`;
}
