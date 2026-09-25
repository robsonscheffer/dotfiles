import type { HeadingRef } from "../types.ts";
import { escapeAttr, escapeHtml } from "./util.ts";

interface TocNode {
  text: string;
  id: string;
  children: TocNode[];
}

function buildTocTree(headings: HeadingRef[]): TocNode[] {
  const roots: TocNode[] = [];
  let current: TocNode | null = null;
  for (const h of headings) {
    if (h.level === 2) {
      current = { text: h.text, id: h.id, children: [] };
      roots.push(current);
    } else if (h.level === 3) {
      const node: TocNode = { text: h.text, id: h.id, children: [] };
      if (current) current.children.push(node);
      else roots.push(node);
    }
  }
  return roots;
}

function renderTocTree(nodes: TocNode[]): string {
  if (nodes.length === 0) return "";
  const items = nodes
    .map((n) => `<li><a href="#${escapeAttr(n.id)}">${escapeHtml(n.text)}</a>${n.children.length ? renderTocTree(n.children) : ""}</li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

export function renderToc(headings: HeadingRef[]): string {
  const tree = buildTocTree(headings);
  if (tree.length === 0) return "";
  return `<nav class="toc" aria-label="Table of contents">${renderTocTree(tree)}</nav>`;
}
