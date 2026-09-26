// A generalized version of markdown-it-container's block rule. The upstream plugin binds one
// registration per fixed container name and matches a closing fence purely by "is this line a
// bare fence of at least the opener's marker length" - which breaks same-length nesting
// (":::" inside ":::") because the scan has no notion of depth: it treats the first bare ":::"
// it finds as ITS closer even when that line actually closes an inner directive.
//
// This version tracks depth instead of marker length. Any fence-shaped line (3+ ':' characters)
// followed by more text on the same line is an opener and increments depth by one; any
// fence-shaped line with nothing else on it is a closer and decrements depth by one. The
// directive closes when depth returns to zero. This makes nesting work regardless of whether
// inner and outer use the same marker length ("::::steps" wrapping ":::note" still works, but so
// does ":::steps" wrapping ":::note" - the marker length is no longer load-bearing for nesting,
// only for the initial "is this even a directive line" sniff, which still requires >= 3 colons).
//
// Lines inside a fenced code block (``` or ~~~) are skipped entirely while scanning for the
// closer, so a ":::" that is only code-block content never counts as an open or close marker.
//
// A bare closing fence with no directive open above it (depth would go negative) is not silently
// treated as ordinary text: it is claimed as a "stray_close" token so the caller can report it as
// an error with a position, instead of it leaking into a paragraph.
//
// Token shape produced:
//   directive_open    info = "<name> <args...>", meta = { name, args, closed }
//   directive_close
//   stray_close        a bare closing fence with no open directive; self-closing (nesting 0)

import type { MarkdownIt, StateBlock } from "markdown-it";

const COLON = ":".charCodeAt(0);
const BACKTICK = "`".charCodeAt(0);
const TILDE = "~".charCodeAt(0);
const MIN_MARKERS = 3;

export interface DirectiveMeta {
  name: string;
  args: string[];
  closed: boolean;
}

// Fence-shaped line info: how many marker chars, and what (if anything) follows them.
function fenceLine(state: StateBlock, line: number): { markerCount: number; tail: string } | null {
  const start = state.bMarks[line]! + state.tShift[line]!;
  const max = state.eMarks[line]!;
  if (state.sCount[line]! - state.blkIndent >= 4) return null;
  if (COLON !== state.src.charCodeAt(start)) return null;

  let pos: number;
  for (pos = start + 1; pos <= max; pos++) {
    if (state.src.charCodeAt(pos) !== COLON) break;
  }
  const markerCount = pos - start;
  if (markerCount < MIN_MARKERS) return null;

  return { markerCount, tail: state.src.slice(pos, max).trim() };
}

// Whether `line` opens or closes a fenced code block (``` or ~~~, 3+ of the same char). Returns
// the fence char code and length when it opens one, or null when it isn't a fence line at all.
function codeFenceMarker(state: StateBlock, line: number): { ch: number; len: number } | null {
  const start = state.bMarks[line]! + state.tShift[line]!;
  const max = state.eMarks[line]!;
  if (state.sCount[line]! - state.blkIndent >= 4) return null;
  const ch = state.src.charCodeAt(start);
  if (ch !== BACKTICK && ch !== TILDE) return null;

  let pos: number;
  for (pos = start + 1; pos <= max; pos++) {
    if (state.src.charCodeAt(pos) !== ch) break;
  }
  const len = pos - start;
  if (len < 3) return null;
  return { ch, len };
}

function directiveRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const opener = fenceLine(state, startLine);
  if (!opener) return false;

  if (opener.tail.length === 0) {
    // A bare fence with no directive open above it: claim it as a stray closer, not text.
    if (silent) return true;
    const start = state.bMarks[startLine]! + state.tShift[startLine]!;
    const max = state.eMarks[startLine]!;
    const markup = state.src.slice(start, start + opener.markerCount);
    const token = state.push("stray_close", "", 0);
    token.markup = markup;
    token.block = true;
    token.map = [startLine, startLine + 1];
    state.line = startLine + 1;
    return true;
  }

  if (silent) return true;

  const parts = opener.tail.split(/\s+/);
  const name = parts[0]!;
  const args = parts.slice(1);

  let nextLine = startLine;
  let depth = 1;
  let closed = false;
  let codeFence: { ch: number; len: number } | null = null;

  for (;;) {
    nextLine++;
    if (nextLine >= endLine) break;

    const start = state.bMarks[nextLine]! + state.tShift[nextLine]!;
    const max = state.eMarks[nextLine]!;
    if (start < max && state.sCount[nextLine]! < state.blkIndent) break;

    if (codeFence) {
      const closer = codeFenceMarker(state, nextLine);
      if (closer && closer.ch === codeFence.ch && closer.len >= codeFence.len) {
        const tailStart = start + closer.len;
        if (state.skipSpaces(tailStart) >= max) codeFence = null;
      }
      continue; // never treat a line inside a code fence as a directive marker
    }

    const opensCode = codeFenceMarker(state, nextLine);
    if (opensCode) {
      codeFence = opensCode;
      continue;
    }

    const line = fenceLine(state, nextLine);
    if (!line) continue;

    if (line.tail.length === 0) {
      depth--;
      if (depth === 0) {
        closed = true;
        break;
      }
    } else {
      depth++;
    }
  }

  const oldParent = state.parentType;
  const oldLineMax = state.lineMax;
  state.parentType = "container";
  state.lineMax = nextLine;

  const openToken = state.push("directive_open", "div", 1);
  openToken.info = opener.tail;
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
