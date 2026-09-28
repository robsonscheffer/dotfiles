import type { LinkKind } from "../types.ts";

export function classifyLink(target: string): LinkKind {
  if (target.startsWith("#")) return "anchor";
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return "url"; // has a URI scheme (http:, mailto:, ...)
  if (/\.md(#.*)?$/.test(target)) return "md";
  return "url";
}
