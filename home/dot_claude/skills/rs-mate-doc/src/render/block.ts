import type { Block, BlockquoteNode, CodeBlockNode, ErrorNode, HeadingNode, ListItemNode, ListNode, ParagraphNode, TableNode } from "../types.ts";
import type { Ctx } from "./ctx.ts";
import { renderDirective } from "./directives.ts";
import { highlightCode } from "./highlight.ts";
import { collectClaimRefs, excerptFor, renderInline, sourceLinkFor } from "./inline.ts";
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
  const evidence = refs.map((r) => renderClaimEvidence(r.id, ctx)).join("");
  return `<p>${html}</p>${evidence}`;
}

function renderClaimEvidence(id: string, ctx: Ctx): string {
  const claim = ctx.ledger?.claims.find((c) => c.id === id);
  if (!claim) {
    return `<div class="claim-evidence claim-evidence-missing">Missing claim ${escapeHtml(id)}</div>`;
  }
  const excerpt = claim.evidence ? excerptFor(claim.evidence) : "";
  const source = claim.evidence ? sourceLinkFor(claim.evidence) : "";
  const date = claim.checked_at ?? "";
  const verdict = claim.verdict ?? claim.status;
  return (
    `<div class="claim-evidence">` +
    `<span class="claim-id">${escapeHtml(claim.id)}</span>` +
    (excerpt ? `<code class="claim-excerpt">${escapeHtml(excerpt)}</code>` : "") +
    source +
    (date ? `<time class="claim-date">${escapeHtml(date)}</time>` : "") +
    `<span class="verdict-badge verdict-${escapeAttr(verdict)}">${escapeHtml(verdict)}</span>` +
    `</div>`
  );
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
    const lines = n.value
      .split("\n")
      .map((line) => {
        let cls = "diff-ctx";
        if (line.startsWith("+")) cls = "diff-add";
        else if (line.startsWith("-")) cls = "diff-del";
        return `<span class="${cls}">${escapeHtml(line)}</span>`;
      })
      .join("\n");
    return `<figure class="code-block diff">${caption}<pre><code>${lines}</code></pre></figure>`;
  }
  const { html, language } = highlightCode(n.value, n.lang);
  const langClass = language ? ` language-${escapeAttr(language)}` : "";
  return `<figure class="code-block">${caption}<pre><code class="hljs${langClass}">${html}</code></pre></figure>`;
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
