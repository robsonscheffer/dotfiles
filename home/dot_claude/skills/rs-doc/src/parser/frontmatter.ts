// YAML frontmatter extraction. Uses Bun.YAML.parse; no external YAML dependency.

import type { Frontmatter } from "../types.ts";

const KNOWN_KEYS = new Set([
  "title",
  "type",
  "summary",
  "tags",
  "sources",
  "created",
  "updated",
  "status",
  "shape",
  "tour",
  "approved_by",
  "approved_at",
  "ledger_hash",
]);

export interface FrontmatterResult {
  frontmatter: Frontmatter;
  body: string;
  // 0-based line index, in the original source, where the body begins.
  bodyStartLine: number;
}

function emptyFrontmatter(): Frontmatter {
  return { extra: {} };
}

export function extractFrontmatter(src: string): FrontmatterResult {
  if (!src.startsWith("---")) {
    return { frontmatter: emptyFrontmatter(), body: src, bodyStartLine: 0 };
  }

  const firstLineEnd = src.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? src : src.slice(0, firstLineEnd);
  if (firstLine.trim() !== "---") {
    return { frontmatter: emptyFrontmatter(), body: src, bodyStartLine: 0 };
  }

  const rest = firstLineEnd === -1 ? "" : src.slice(firstLineEnd + 1);
  const lines = rest.split("\n");
  let closeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === "---") {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx === -1) {
    // Unterminated fence: not frontmatter, treat the whole file as body.
    return { frontmatter: emptyFrontmatter(), body: src, bodyStartLine: 0 };
  }

  const yamlText = lines.slice(0, closeIdx).join("\n");
  const bodyLines = lines.slice(closeIdx + 1);
  const body = bodyLines.join("\n");
  // line 0 is the opening "---"; lines[0..closeIdx] map to original lines 1..closeIdx+1.
  const bodyStartLine = closeIdx + 2;

  let parsed: unknown = {};
  if (yamlText.trim().length > 0) {
    parsed = Bun.YAML.parse(yamlText);
  }
  const raw = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};

  const frontmatter: Frontmatter = { extra: {} };
  for (const [key, value] of Object.entries(raw)) {
    if (KNOWN_KEYS.has(key)) {
      (frontmatter as unknown as Record<string, unknown>)[key] = value;
    } else {
      frontmatter.extra[key] = value;
    }
  }

  return { frontmatter, body, bodyStartLine };
}
