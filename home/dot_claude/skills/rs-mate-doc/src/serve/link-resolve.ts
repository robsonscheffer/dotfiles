// Resolves relative .md links and [[wikilinks]] against the folders the
// server is allowed to touch. Returns null when nothing matches; the render
// layer is responsible for turning that into a visible marker.
import { readdir, realpath } from "node:fs/promises";
import { dirname, join, normalize, relative, sep } from "node:path";
import type { Block, Doc, Inline, LinkNode } from "../types.ts";
import type { RememberedFolder } from "./state.ts";
import { isWithin } from "./state.ts";

async function walk(dirAbs: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dirAbs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(abs)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(abs);
    }
  }
  return out;
}

function hrefFor(folder: RememberedFolder, fileAbs: string): string {
  const rel = relative(folder.path, fileAbs).replace(/\.md$/, "");
  const parts = rel.split(sep).filter(Boolean);
  return `/${folder.alias}/${parts.map(encodeURIComponent).join("/")}`;
}

async function resolveWiki(folders: RememberedFolder[], target: string): Promise<string | null> {
  const wanted = target.toLowerCase();
  for (const folder of folders) {
    const files = await walk(folder.path);
    for (const file of files) {
      const base = file.slice(folder.path.length + 1).replace(/\.md$/, "");
      const segments = base.split(sep);
      const leaf = segments.pop() ?? base;
      const folderNote = leaf === "index" ? segments.pop()?.toLowerCase() : undefined;
      if (leaf.toLowerCase() === wanted || base.toLowerCase() === wanted || folderNote === wanted) {
        return hrefFor(folder, file);
      }
    }
  }
  return null;
}

async function resolveRelative(
  folders: RememberedFolder[],
  currentDocAbsPath: string,
  target: string,
): Promise<string | null> {
  const currentDir = dirname(currentDocAbsPath);
  const candidate = normalize(join(currentDir, target));
  let real: string;
  try {
    real = await realpath(candidate.endsWith(".md") ? candidate : `${candidate}.md`);
  } catch {
    try {
      real = await realpath(candidate);
    } catch {
      return null;
    }
  }
  for (const folder of folders) {
    if (isWithin(folder.path, real)) return hrefFor(folder, real);
  }
  return null;
}

export function makeResolveLink(
  folders: RememberedFolder[],
  currentDocAbsPath: string,
): (node: LinkNode) => Promise<string | null> {
  return async (node: LinkNode) => {
    if (node.kind === "wiki") return resolveWiki(folders, node.target);
    if (node.kind === "md") return resolveRelative(folders, currentDocAbsPath, node.target);
    return node.target;
  };
}

function inlineLinks(node: Inline, out: LinkNode[]): void {
  if (node.type === "link") {
    out.push(node);
    for (const child of node.children) inlineLinks(child, out);
    return;
  }
  if (node.type === "emphasis" || node.type === "strong") {
    for (const child of node.children) inlineLinks(child, out);
  }
}

function blockLinks(node: Block, out: LinkNode[]): void {
  switch (node.type) {
    case "heading":
    case "paragraph":
      for (const child of node.children) inlineLinks(child, out);
      break;
    case "list":
      for (const child of node.children) blockLinks(child, out);
      break;
    case "listItem":
    case "blockquote":
    case "directive":
    case "error":
      for (const child of node.children) blockLinks(child, out);
      break;
    case "table":
      for (const row of [node.head, ...node.rows]) {
        for (const cell of row) for (const inline of cell) inlineLinks(inline, out);
      }
      break;
    default:
      break;
  }
}

export function collectLinks(doc: Doc): LinkNode[] {
  const out: LinkNode[] = [];
  for (const block of doc.body) blockLinks(block, out);
  return out;
}

// RenderOptions.resolveLink is synchronous. We resolve every link ahead of
// render and hand render a synchronous lookup over the precomputed map.
export async function precomputeResolvedLinks(
  folders: RememberedFolder[],
  currentDocAbsPath: string,
  doc: Doc,
): Promise<Map<LinkNode, string | null>> {
  const resolver = makeResolveLink(folders, currentDocAbsPath);
  const map = new Map<LinkNode, string | null>();
  for (const link of collectLinks(doc)) {
    if (link.kind === "wiki" || link.kind === "md") {
      map.set(link, await resolver(link));
    }
  }
  return map;
}
