import type { Doc } from "../types.ts";
import { buildDoc } from "./ast.ts";
import { extractFrontmatter } from "./frontmatter.ts";
import { createMarkdownIt } from "./markdown-it-instance.ts";

const md = createMarkdownIt();

export function parse(src: string, path: string): Doc {
  const { frontmatter, body, bodyStartLine } = extractFrontmatter(src);
  const tokens = md.parse(body, {});
  const bodyLines = body.split("\n");
  return buildDoc(path, frontmatter, bodyLines, bodyStartLine, tokens);
}
