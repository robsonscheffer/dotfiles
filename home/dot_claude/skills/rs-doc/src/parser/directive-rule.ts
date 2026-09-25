// A generalized version of markdown-it-container's block rule. The upstream plugin binds one
// registration per fixed container name; directives need one rule that accepts any name (known
// or not) and records whether a closing fence was actually found, since the upstream algorithm
// silently auto-closes at end of document without saying so.
//
// Token shape produced:
//   directive_open   info = "<name> <args...>", meta = { name, args, closed }
//   directive_close

import type { MarkdownIt, StateBlock } from "markdown-it";

const MARKER_CHAR = ":".charCodeAt(0);
const MIN_MARKERS = 3;

export interface DirectiveMeta {
  name: string;
  args: string[];
  closed: boolean;
}

function directiveRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  let start = state.bMarks[startLine]! + state.tShift[startLine]!;
  let max = state.eMarks[startLine]!;

  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
  if (MARKER_CHAR !== state.src.charCodeAt(start)) return false;

  let pos: number;
  for (pos = start + 1; pos <= max; pos++) {
    if (state.src.charCodeAt(pos) !== MARKER_CHAR) break;
  }
  const markerCount = pos - start;
  if (markerCount < MIN_MARKERS) return false;

  const paramsRaw = state.src.slice(pos, max).trim();
  if (paramsRaw.length === 0) return false; // a bare fence only ever closes, never opens

  if (silent) return true;

  const parts = paramsRaw.split(/\s+/);
  const name = parts[0]!;
  const args = parts.slice(1);

  let nextLine = startLine;
  let closed = false;

  for (;;) {
    nextLine++;
    if (nextLine >= endLine) break;

    start = state.bMarks[nextLine]! + state.tShift[nextLine]!;
    max = state.eMarks[nextLine]!;

    if (start < max && state.sCount[nextLine]! < state.blkIndent) break;
    if (MARKER_CHAR !== state.src.charCodeAt(start)) continue;
    if (state.sCount[nextLine]! - state.blkIndent >= 4) continue;

    for (pos = start + 1; pos <= max; pos++) {
      if (state.src.charCodeAt(pos) !== MARKER_CHAR) break;
    }
    if (pos - start < markerCount) continue;

    pos = state.skipSpaces(pos);
    if (pos < max) continue;

    closed = true;
    break;
  }

  const oldParent = state.parentType;
  const oldLineMax = state.lineMax;
  state.parentType = "container";
  state.lineMax = nextLine;

  const openToken = state.push("directive_open", "div", 1);
  openToken.info = paramsRaw;
  openToken.block = true;
  openToken.map = [startLine, nextLine];
  openToken.meta = { name, args, closed } satisfies DirectiveMeta;

  state.md.block.tokenize(state, startLine + 1, nextLine);

  const closeToken = state.push("directive_close", "div", -1);
  closeToken.block = true;

  state.parentType = oldParent;
  state.lineMax = oldLineMax;
  state.line = nextLine + (closed ? 1 : 0);

  return true;
}

export function installDirectiveRule(md: MarkdownIt): void {
  md.block.ruler.before("fence", "directive", directiveRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
}
