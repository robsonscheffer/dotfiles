// Converts a markdown-it token stream into mate-doc's own AST (src/types.ts).
//
// Position caveat (see findings/W0.3.md): markdown-it block tokens carry only
// [startLine, endLine) (0-indexed, end exclusive) via `.map`. Inline tokens carry no position
// at all. For inline nodes we walk the parent block's raw inline-content string with a cursor,
// locating each leaf token's literal text via indexOf and advancing the cursor past it; opening
// and closing markup for em/strong is located the same way using `.markup`. Structural tokens
// with no fixed-width literal (link/image edges) fall back to "wherever the cursor currently is,"
// which is an honest but approximate position. Those node kinds are listed in the parser's
// result summary, not hidden.

import type { Token } from "markdown-it";
import type {
  Block,
  BlockquoteNode,
  ClaimId,
  CodeBlockNode,
  DirectiveName,
  DirectiveNode,
  Doc,
  ErrorNode,
  HeadingNode,
  HeadingRef,
  HtmlBlockNode,
  HtmlInlineNode,
  Inline,
  LinkNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  Pos,
  Span,
  TableNode,
  ThematicBreakNode,
} from "../types.ts";
import { DIRECTIVES, RAW_DIRECTIVES } from "../types.ts";
import { parseFenceInfo } from "./code-meta.ts";
import type { ClaimRefMeta, WikilinkMeta } from "./inline-rules.ts";
import { classifyLink } from "./links.ts";
import { SlugGenerator } from "./slug.ts";

interface Ctx {
  lines: string[];
  bodyStartLine: number; // 0-based, in the full document
  slugs: SlugGenerator;
  headings: HeadingRef[];
  claimRefs: (Inline & { type: "claimRef" })[];
  errors: ErrorNode[];
  approxKinds: Set<string>;
}

function absLine1(ctx: Ctx, line0: number): number {
  return ctx.bodyStartLine + line0 + 1;
}

function blockSpan(ctx: Ctx, map: [number, number] | null): Span {
  if (!map) {
    const line = absLine1(ctx, 0);
    return { start: { line, column: 1 }, end: { line, column: 1 } };
  }
  const [startLine0, endLine0Exclusive] = map;
  const endLine0 = Math.max(startLine0, endLine0Exclusive - 1);
  const endText = ctx.lines[endLine0] ?? "";
  return {
    start: { line: absLine1(ctx, startLine0), column: 1 },
    end: { line: absLine1(ctx, endLine0), column: endText.length + 1 },
  };
}

function findClose(tokens: Token[], openIdx: number, openType: string, closeType: string): number {
  let depth = 0;
  for (let j = openIdx; j < tokens.length; j++) {
    const type = tokens[j]!.type;
    if (type === openType) depth++;
    else if (type === closeType) {
      depth--;
      if (depth === 0) return j;
    }
  }
  throw new Error(`mate-doc parser: unbalanced ${openType}, no matching ${closeType}`);
}

// ---------------------------------------------------------------------------------------------
// Inline conversion

class InlineCursor {
  private cursor = 0;

  constructor(
    private readonly content: string,
    private readonly ctx: Ctx,
    private readonly blockStartLine0: number,
  ) {}

  private posAt(offset: number): Pos {
    let line0 = this.blockStartLine0;
    let lastNl = -1;
    for (let i = 0; i < offset; i++) {
      if (this.content.charCodeAt(i) === 10) {
        line0++;
        lastNl = i;
      }
    }
    return { line: absLine1(this.ctx, line0), column: offset - lastNl };
  }

  // Finds `literal` at or after the cursor, returns its start position, and advances the
  // cursor past it. Falls back to the current cursor (without consuming) when not found.
  consume(literal: string): Pos {
    const idx = this.content.indexOf(literal, this.cursor);
    if (idx === -1) {
      const pos = this.posAt(this.cursor);
      this.cursor += literal.length;
      return pos;
    }
    const pos = this.posAt(idx);
    this.cursor = idx + literal.length;
    return pos;
  }

  // No known literal (link/image edges): position is "here," cursor does not move.
  here(): Pos {
    return this.posAt(this.cursor);
  }

  advanceTo(idx: number): void {
    if (idx > this.cursor) this.cursor = idx;
  }

  indexOfFrom(literal: string): number {
    return this.content.indexOf(literal, this.cursor);
  }
}

function collectText(children: Inline[]): string {
  let out = "";
  for (const child of children) {
    switch (child.type) {
      case "text":
        out += child.value;
        break;
      case "inlineCode":
        out += child.value;
        break;
      case "emphasis":
      case "strong":
      case "link":
        out += collectText(child.children);
        break;
      default:
        break;
    }
  }
  return out;
}

function convertInline(inlineToken: Token, ctx: Ctx, blockStartLine0: number): Inline[] {
  const children = inlineToken.children ?? [];
  const cursor = new InlineCursor(inlineToken.content, ctx, blockStartLine0);
  return convertInlineRange(children, 0, children.length, cursor, ctx);
}

function convertInlineRange(tokens: Token[], lo: number, hi: number, cursor: InlineCursor, ctx: Ctx): Inline[] {
  const out: Inline[] = [];
  let i = lo;
  while (i < hi) {
    const t = tokens[i]!;
    switch (t.type) {
      case "text": {
        const start = cursor.consume(t.content);
        out.push({ type: "text", value: t.content, pos: { start, end: cursor.here() } });
        i++;
        break;
      }
      case "code_inline": {
        const fence = t.markup || "`";
        const literal = fence + t.content + fence;
        const start = cursor.consume(literal);
        out.push({
          type: "inlineCode",
          value: t.content,
          pos: { start, end: { line: start.line, column: start.column + literal.length } },
        });
        i++;
        break;
      }
      case "claim_ref": {
        const meta = t.meta as unknown as ClaimRefMeta;
        const start = cursor.consume(t.content);
        const node = {
          type: "claimRef" as const,
          id: meta.id as ClaimId,
          pos: { start, end: { line: start.line, column: start.column + t.content.length } },
        };
        out.push(node);
        ctx.claimRefs.push(node);
        i++;
        break;
      }
      case "wikilink": {
        const meta = t.meta as unknown as WikilinkMeta;
        const start = cursor.consume(t.content);
        const end = { line: start.line, column: start.column + t.content.length };
        const label = meta.label ?? meta.target;
        out.push({
          type: "link",
          kind: "wiki",
          target: meta.target,
          children: [{ type: "text", value: label, pos: { start, end } }],
          pos: { start, end },
        });
        i++;
        break;
      }
      case "html_inline": {
        const start = cursor.consume(t.content);
        out.push({
          type: "htmlInline",
          value: t.content,
          pos: { start, end: { line: start.line, column: start.column + t.content.length } },
        });
        i++;
        break;
      }
      case "softbreak": {
        const start = cursor.consume("\n");
        out.push({ type: "break", pos: { start, end: start } });
        i++;
        break;
      }
      case "hardbreak": {
        ctx.approxKinds.add("break (hardbreak)");
        const start = cursor.here();
        const idx = cursor.indexOfFrom("\n");
        if (idx !== -1) cursor.advanceTo(idx + 1);
        out.push({ type: "break", pos: { start, end: start } });
        i++;
        break;
      }
      case "em_open": {
        ctx.approxKinds.add("emphasis (open/close marker span)");
        const marker = t.markup || "*";
        const start = cursor.consume(marker);
        const close = findClose(tokens, i, "em_open", "em_close");
        const inner = convertInlineRange(tokens, i + 1, close, cursor, ctx);
        const endToken = tokens[close]!;
        const end = cursor.consume(endToken.markup || marker);
        out.push({ type: "emphasis", children: inner, pos: { start, end } });
        i = close + 1;
        break;
      }
      case "strong_open": {
        ctx.approxKinds.add("strong (open/close marker span)");
        const marker = t.markup || "**";
        const start = cursor.consume(marker);
        const close = findClose(tokens, i, "strong_open", "strong_close");
        const inner = convertInlineRange(tokens, i + 1, close, cursor, ctx);
        const endToken = tokens[close]!;
        const end = cursor.consume(endToken.markup || marker);
        out.push({ type: "strong", children: inner, pos: { start, end } });
        i = close + 1;
        break;
      }
      case "link_open": {
        ctx.approxKinds.add("link (edges approximate, honest-effort cursor position)");
        const start = cursor.consume("[");
        const close = findClose(tokens, i, "link_open", "link_close");
        const inner = convertInlineRange(tokens, i + 1, close, cursor, ctx);
        const href = String(t.attrGet("href") ?? "");
        // Best-effort: land the cursor after the closing paren/bracket of the link tail.
        const tailIdx = cursor.indexOfFrom(")");
        const end = cursor.here();
        if (tailIdx !== -1) cursor.advanceTo(tailIdx + 1);
        out.push({ type: "link", kind: classifyLink(href), target: href, children: inner, pos: { start, end } });
        i = close + 1;
        break;
      }
      case "image": {
        ctx.approxKinds.add("image (edges approximate)");
        const start = cursor.consume("![");
        const src = String(t.attrGet("src") ?? "");
        const alt = String(t.attrGet("alt") ?? "");
        const tailIdx = cursor.indexOfFrom(")");
        const end = cursor.here();
        if (tailIdx !== -1) cursor.advanceTo(tailIdx + 1);
        out.push({ type: "image", src, alt, pos: { start, end } });
        i++;
        break;
      }
      default:
        i++;
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Table

function convertTable(tokens: Token[], openIdx: number, closeIdx: number, ctx: Ctx): TableNode {
  const align: TableNode["align"] = [];
  const head: Inline[][] = [];
  const rows: Inline[][][] = [];
  const anchorLine0 = tokens[openIdx]!.map ? tokens[openIdx]!.map![0] : 0;

  const readCells = (
    lo: number,
    hi: number,
    cellOpenType: string,
    cellCloseType: string,
    onCell: (cellIdx: number, inline: Token | undefined, styleAttr: string | null) => void,
  ): void => {
    let j = lo;
    let cellIdx = 0;
    while (j < hi) {
      if (tokens[j]!.type === cellOpenType) {
        const cellClose = findClose(tokens, j, cellOpenType, cellCloseType);
        const styleAttr = tokens[j]!.attrGet("style");
        const style = styleAttr === null ? null : String(styleAttr);
        onCell(cellIdx, tokens[j + 1], style);
        cellIdx++;
        j = cellClose + 1;
      } else {
        j++;
      }
    }
  };

  let i = openIdx + 1;
  while (i < closeIdx) {
    const t = tokens[i]!;
    if (t.type === "thead_open") {
      const theadClose = findClose(tokens, i, "thead_open", "thead_close");
      let j = i + 1;
      while (j < theadClose) {
        if (tokens[j]!.type === "tr_open") {
          const trClose = findClose(tokens, j, "tr_open", "tr_close");
          readCells(j + 1, trClose, "th_open", "th_close", (cellIdx, inline, style) => {
            const match = style ? /text-align:(left|center|right)/.exec(style) : null;
            align[cellIdx] = match ? (match[1] as "left" | "center" | "right") : null;
            head.push(inline && inline.type === "inline" ? convertInline(inline, ctx, anchorLine0) : []);
          });
          j = trClose + 1;
        } else j++;
      }
      i = theadClose + 1;
    } else if (t.type === "tbody_open") {
      const tbodyClose = findClose(tokens, i, "tbody_open", "tbody_close");
      let j = i + 1;
      while (j < tbodyClose) {
        if (tokens[j]!.type === "tr_open") {
          const trClose = findClose(tokens, j, "tr_open", "tr_close");
          const rowCells: Inline[][] = [];
          readCells(j + 1, trClose, "td_open", "td_close", (_cellIdx, inline) => {
            rowCells.push(inline && inline.type === "inline" ? convertInline(inline, ctx, anchorLine0) : []);
          });
          rows.push(rowCells);
          j = trClose + 1;
        } else j++;
      }
      i = tbodyClose + 1;
    } else {
      i++;
    }
  }

  ctx.approxKinds.add("table cell inline content (anchored to table start line)");
  return { type: "table", align, head, rows, pos: blockSpan(ctx, tokens[openIdx]!.map) };
}

// ---------------------------------------------------------------------------------------------
// Blocks

function headingLevel(tag: string): 1 | 2 | 3 | 4 | 5 | 6 {
  const n = Number(tag.slice(1));
  return (n >= 1 && n <= 6 ? n : 1) as 1 | 2 | 3 | 4 | 5 | 6;
}

function calloutFrom(children: Block[]): { callout: string | undefined; children: Block[] } {
  const first = children[0];
  if (!first || first.type !== "paragraph") return { callout: undefined, children };
  const firstInline = first.children[0];
  if (!firstInline || firstInline.type !== "text") return { callout: undefined, children };
  const match = /^\[!([a-zA-Z-]+)\]\s*/.exec(firstInline.value);
  if (!match) return { callout: undefined, children };

  const strippedValue = firstInline.value.slice(match[0].length);
  const newFirstInline: Inline = { ...firstInline, value: strippedValue };
  const newFirstParagraph: ParagraphNode = {
    ...first,
    children: [newFirstInline, ...first.children.slice(1)],
  };
  return { callout: match[1], children: [newFirstParagraph, ...children.slice(1)] };
}

export function convertBlocks(tokens: Token[], lo: number, hi: number, ctx: Ctx): Block[] {
  const out: Block[] = [];
  let i = lo;
  while (i < hi) {
    const t = tokens[i]!;
    switch (t.type) {
      case "heading_open": {
        const close = findClose(tokens, i, "heading_open", "heading_close");
        const inlineTok = tokens[i + 1];
        const children = inlineTok && inlineTok.type === "inline" ? convertInline(inlineTok, ctx, t.map![0]) : [];
        const level = headingLevel(t.tag);
        const id = ctx.slugs.slug(collectText(children));
        const pos = blockSpan(ctx, t.map);
        const node: HeadingNode = { type: "heading", level, id, children, pos };
        out.push(node);
        ctx.headings.push({ level, id, text: collectText(children), pos });
        i = close + 1;
        break;
      }
      case "paragraph_open": {
        const close = findClose(tokens, i, "paragraph_open", "paragraph_close");
        const inlineTok = tokens[i + 1];
        const children = inlineTok && inlineTok.type === "inline" ? convertInline(inlineTok, ctx, t.map![0]) : [];
        const node: ParagraphNode = { type: "paragraph", children, pos: blockSpan(ctx, t.map) };
        out.push(node);
        i = close + 1;
        break;
      }
      case "bullet_list_open":
      case "ordered_list_open": {
        const ordered = t.type === "ordered_list_open";
        const close = findClose(tokens, i, t.type, ordered ? "ordered_list_close" : "bullet_list_close");
        const startAttr = t.attrGet("start");
        const children = convertBlocks(tokens, i + 1, close, ctx) as ListItemNode[];
        const node: ListNode = {
          type: "list",
          ordered,
          ...(ordered ? { start: startAttr ? Number(startAttr) : 1 } : {}),
          children,
          pos: blockSpan(ctx, t.map),
        };
        out.push(node);
        i = close + 1;
        break;
      }
      case "list_item_open": {
        const close = findClose(tokens, i, "list_item_open", "list_item_close");
        const children = convertBlocks(tokens, i + 1, close, ctx);
        const node: ListItemNode = { type: "listItem", children, pos: blockSpan(ctx, t.map) };
        out.push(node);
        i = close + 1;
        break;
      }
      case "blockquote_open": {
        const close = findClose(tokens, i, "blockquote_open", "blockquote_close");
        const rawChildren = convertBlocks(tokens, i + 1, close, ctx);
        const { callout, children } = calloutFrom(rawChildren);
        const node: BlockquoteNode = { type: "blockquote", callout, children, pos: blockSpan(ctx, t.map) };
        out.push(node);
        i = close + 1;
        break;
      }
      case "fence":
      case "code_block": {
        const { lang, meta } = t.type === "fence" ? parseFenceInfo(t.info) : { lang: undefined, meta: {} };
        const node: CodeBlockNode = { type: "code", lang, meta, value: t.content, pos: blockSpan(ctx, t.map) };
        out.push(node);
        i++;
        break;
      }
      case "hr": {
        const node: ThematicBreakNode = { type: "thematicBreak", pos: blockSpan(ctx, t.map) };
        out.push(node);
        i++;
        break;
      }
      case "html_block": {
        const node: HtmlBlockNode = { type: "html", value: t.content, pos: blockSpan(ctx, t.map) };
        out.push(node);
        i++;
        break;
      }
      case "table_open": {
        const close = findClose(tokens, i, "table_open", "table_close");
        out.push(convertTable(tokens, i, close, ctx));
        i = close + 1;
        break;
      }
      case "stray_close": {
        const node: ErrorNode = {
          type: "error",
          message: `closing fence ${t.markup} has no open directive`,
          children: [],
          pos: blockSpan(ctx, t.map),
        };
        out.push(node);
        ctx.errors.push(node);
        i++;
        break;
      }
      case "directive_open": {
        const close = findClose(tokens, i, "directive_open", "directive_close");
        const meta = t.meta as unknown as { name: string; args: string[]; closed: boolean };
        const pos = blockSpan(ctx, t.map);
        if (!meta.closed) {
          const children = convertBlocks(tokens, i + 1, close, ctx);
          const node: ErrorNode = {
            type: "error",
            message: `directive :::${meta.name} is never closed`,
            children,
            pos,
          };
          out.push(node);
          ctx.errors.push(node);
        } else {
          const known = (DIRECTIVES as readonly string[]).includes(meta.name);
          const isRaw = known && (RAW_DIRECTIVES as readonly string[]).includes(meta.name as DirectiveName);
          let children: Block[] = [];
          let raw: string[] | undefined;
          if (isRaw) {
            const [startLine0, endLine0] = t.map!;
            raw = ctx.lines.slice(startLine0 + 1, endLine0);
          } else {
            // :::tabs turns each heading into a tab title, never a rendered heading element
            // (see render/directives.ts groupTabs), so its ids have nothing to anchor a TOC
            // link to. Drop headings collected while parsing this directive's children.
            const headingsBefore = ctx.headings.length;
            children = convertBlocks(tokens, i + 1, close, ctx);
            if (meta.name === "tabs") ctx.headings.length = headingsBefore;
          }
          const node: DirectiveNode = {
            type: "directive",
            name: meta.name,
            known,
            args: meta.args,
            children,
            ...(raw ? { raw } : {}),
            pos,
          };
          out.push(node);
        }
        i = close + 1;
        break;
      }
      default:
        i++;
        break;
    }
  }
  return out;
}

export function buildDoc(
  path: string,
  frontmatter: Doc["frontmatter"],
  bodyLines: string[],
  bodyStartLine: number,
  tokens: Token[],
): Doc {
  const ctx: Ctx = {
    lines: bodyLines,
    bodyStartLine,
    slugs: new SlugGenerator(),
    headings: [],
    claimRefs: [],
    errors: [],
    approxKinds: new Set(),
  };
  const body = convertBlocks(tokens, 0, tokens.length, ctx);
  return {
    path,
    frontmatter,
    body,
    headings: ctx.headings,
    claimRefs: ctx.claimRefs as Doc["claimRefs"],
    errors: ctx.errors,
  };
}
