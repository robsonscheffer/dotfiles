import type { Block, Inline } from "../types.ts";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Flattens the visible text of a node subtree, for tab titles, tooltips, and badge checks.
export function plainTextOf(nodes: (Block | Inline)[]): string {
  let out = "";
  for (const n of nodes) {
    if ("children" in n && Array.isArray((n as { children?: unknown }).children)) {
      out += plainTextOf((n as { children: (Block | Inline)[] }).children);
    } else if (n.type === "text" || n.type === "inlineCode") {
      out += (n as { value: string }).value;
    }
    if (n.type === "paragraph" || n.type === "heading" || n.type === "listItem") out += " ";
  }
  return out.trim();
}
