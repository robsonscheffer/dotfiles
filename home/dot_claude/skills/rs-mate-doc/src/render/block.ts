import type { Block, BlockquoteNode, CodeBlockNode, ErrorNode, HeadingNode, ListItemNode, ListNode, ParagraphNode, TableNode } from "../types.ts";
import type { Ctx } from "./ctx.ts";
import { renderDirective } from "./directives.ts";
import { highlightCode } from "./highlight.ts";
import { renderClaimRow } from "./claims.ts";
import { collectClaimRefs, renderInline } from "./inline.ts";
import { escapeAttr, escapeHtml } from "./util.ts";

export function renderBlocks(nodes: Block[], ctx: Ctx): string {
  return nodes.map((n) => renderBlock(n, ctx)).join("\n");
}

export function renderBlock(n: Block, ctx: Ctx): string {
  switch (n.type) {
    case "heading":
      return renderHeading(n, ctx);
    case "paragraph":
      return renderParagraph(n, ctx);
    case "list":
      return renderList(n, ctx);
    case "listItem":
      return renderListItem(n, ctx);
    case "blockquote":
      return renderBlockquote(n, ctx);
    case "code":
      return renderCodeBlock(n);
    case "table":
      return renderTable(n, ctx);
    case "thematicBreak":
      return "<hr>";
    case "html":
      return n.value;
    case "directive":
      return renderDirective(n, ctx);
    case "error":
      return renderError(n, ctx);
  }
}

function renderHeading(n: HeadingNode, ctx: Ctx): string {
  const html = renderInline(n.children, ctx);
  return `<h${n.level} id="${escapeAttr(n.id)}">${html}<a class="anchor" href="#${escapeAttr(n.id)}" aria-label="link to this section">#</a></h${n.level}>`;
}

function renderParagraph(n: ParagraphNode, ctx: Ctx): string {
  const html = renderInline(n.children, ctx);
  const refs = collectClaimRefs(n.children);
  const evidence = refs.map((r) => renderClaimRow(r.id, ctx)).join("");
  return `<p>${html}</p>${evidence}`;
}

function renderList(n: ListNode, ctx: Ctx): string {
  const tag = n.ordered ? "ol" : "ul";
  const startAttr = n.ordered && n.start && n.start !== 1 ? ` start="${n.start}"` : "";
  const items = n.children.map((li) => renderListItem(li, ctx)).join("");
  return `<${tag}${startAttr}>${items}</${tag}>`;
}

function renderListItem(n: ListItemNode, ctx: Ctx): string {
  const checkbox = n.checked !== undefined ? `<input type="checkbox" disabled${n.checked ? " checked" : ""}> ` : "";
  return `<li>${checkbox}${renderBlocks(n.children, ctx)}</li>`;
}

function renderBlockquote(n: BlockquoteNode, ctx: Ctx): string {
  if (n.callout) {
    return (
      `<aside class="callout callout-${escapeAttr(n.callout.toLowerCase())}">` +
      `<p class="callout-title">${escapeHtml(n.callout)}</p>${renderBlocks(n.children, ctx)}</aside>`
    );
  }
  return `<blockquote>${renderBlocks(n.children, ctx)}</blockquote>`;
}

function renderCodeBlock(n: CodeBlockNode): string {
  const title = n.meta.title;
  const caption = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : "";
  if (n.lang === "diff") {
    return renderDiffBlock(n, caption);
  }
  const { html, language } = highlightCode(n.value, n.lang);
  const langClass = language ? ` language-${escapeAttr(language)}` : "";
  return `<figure class="code-block">${caption}<pre><code class="hljs${langClass}">${html}</code></pre></figure>`;
}

// `file=<path>` (or `title=<path>`) becomes a file header above the code. Each `@@ -a,b +c,d @@`
// line resets the pre- and post-image counters, so every row gets an old and a new gutter cell;
// a cell stays blank on the side the line does not exist.
const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function renderDiffBlock(n: CodeBlockNode, caption: string): string {
  const file = n.meta.file ?? n.meta.title;
  const header = file ? `<div class="diff-file">${escapeHtml(file)}</div>` : "";
  const start = n.meta.start ? Number.parseInt(n.meta.start, 10) : null;
  let oldLine: number | null = start;
  let newLine: number | null = start;
  const cell = (side: "old" | "new", value: number | null) =>
    `<span class="diff-num diff-num-${side}">${value ?? ""}</span>`;
  const lines = n.value
    .split("\n")
    .map((line) => {
      const hunk = HUNK_RE.exec(line);
      if (hunk) {
        oldLine = Number(hunk[1]);
        newLine = Number(hunk[2]);
        return `<span class="diff-hunk">${cell("old", null)}${cell("new", null)}${escapeHtml(line)}</span>`;
      }
      let cls = "diff-ctx";
      let gutter: string;
      if (line.startsWith("+")) {
        cls = "diff-add";
        gutter = cell("old", null) + cell("new", newLine);
        if (newLine !== null) newLine++;
      } else if (line.startsWith("-")) {
        cls = "diff-del";
        gutter = cell("old", oldLine) + cell("new", null);
        if (oldLine !== null) oldLine++;
      } else {
        gutter = cell("old", oldLine) + cell("new", newLine);
        if (oldLine !== null) oldLine++;
        if (newLine !== null) newLine++;
      }
      return `<span class="${cls}">${gutter}<span class="diff-sign">${escapeHtml(line.slice(0, 1))}</span>${escapeHtml(line.slice(1))}</span>`;
    })
    .join("");
  return `<figure class="code-block diff">${file ? "" : caption}${header}<pre><code>${lines}</code></pre></figure>`;
}

export function renderTable(n: TableNode, ctx: Ctx, badgeify = false): string {
  const alignAttr = (a: TableNode["align"][number]) => (a ? ` style="text-align:${a}"` : "");
  const head = `<tr>${n.head.map((cell, i) => `<th${alignAttr(n.align[i] ?? null)}>${renderInline(cell, ctx)}</th>`).join("")}</tr>`;
  const rows = n.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => {
            const html = badgeify ? badgeifyCell(cell, ctx) : renderInline(cell, ctx);
            return `<td${alignAttr(n.align[i] ?? null)}>${html}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function badgeifyCell(cell: Parameters<typeof renderInline>[0], ctx: Ctx): string {
  const text = plainInlineText(cell).trim().toUpperCase();
  if (text === "HIGH" || text === "MED" || text === "LOW") {
    return `<span class="risk-badge risk-${text.toLowerCase()}">${text}</span>`;
  }
  return renderInline(cell, ctx);
}

function plainInlineText(nodes: Parameters<typeof renderInline>[0]): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text" || n.type === "inlineCode") out += n.value;
    else if ("children" in n) out += plainInlineText(n.children);
  }
  return out;
}

function renderError(n: ErrorNode, ctx: Ctx): string {
  const body = n.children.length ? renderBlocks(n.children, ctx) : "";
  return `<div class="doc-error">${escapeHtml(n.message)}${body}</div>`;
}
