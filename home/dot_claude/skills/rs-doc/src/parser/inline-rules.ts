// Custom inline rules: claim refs ({C7}) and wikilinks ([[Page|label]]).
//
// claim_ref is registered after "backticks" so inline code is tokenized first; fenced code
// never reaches the inline parser at all, so both exclude claim refs by construction.

import type { MarkdownIt, StateInline } from "markdown-it";

const CLAIM_REF_RE = /^\{C(\d+)\}/;
const WIKILINK_RE = /^\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/;

export interface ClaimRefMeta {
  id: string; // "C<digits>", validated/typed by the caller
}

export interface WikilinkMeta {
  target: string;
  label: string | null;
}

function claimRefRule(state: StateInline, silent: boolean): boolean {
  const match = CLAIM_REF_RE.exec(state.src.slice(state.pos));
  if (!match) return false;
  if (silent) return true;

  const token = state.push("claim_ref", "", 0);
  token.content = match[0];
  token.meta = { id: `C${match[1]}` } satisfies ClaimRefMeta;
  state.pos += match[0].length;
  return true;
}

function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const match = WIKILINK_RE.exec(state.src.slice(state.pos));
  if (!match) return false;
  if (silent) return true;

  const token = state.push("wikilink", "", 0);
  token.content = match[0];
  token.meta = {
    target: match[1]!.trim(),
    label: match[2] ? match[2].trim() : null,
  } satisfies WikilinkMeta;
  state.pos += match[0].length;
  return true;
}

export function installInlineRules(md: MarkdownIt): void {
  md.inline.ruler.after("backticks", "claim_ref", claimRefRule);
  // Before "link" so "[[Page]]" is not swallowed by the standard link/reference rules.
  md.inline.ruler.before("link", "wikilink", wikilinkRule);
}
