import MarkdownItFactory from "markdown-it";
import type { MarkdownIt } from "markdown-it";
import { installDirectiveRule } from "./directive-rule.ts";
import { installInlineRules } from "./inline-rules.ts";

export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownItFactory({ html: true });
  installDirectiveRule(md);
  installInlineRules(md);
  return md;
}
