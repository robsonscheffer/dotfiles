import type { Block, Doc, HeadingNode, Ledger, RenderOptions } from "../types.ts";
import { renderBanner } from "./banner.ts";
import { renderBlock, renderBlocks } from "./block.ts";
import { CLAIM_PANEL_SCRIPT, renderClaimsList } from "./claims.ts";
import { createCtx } from "./ctx.ts";
import { extractRail, renderDirective } from "./directives.ts";
import { renderNav } from "./nav.ts";
import { renderNoteControl, renderNotesScript, renderNotesToolbar, type NoteHeading } from "./notes.ts";
import { THEME_CSS, THEME_TOGGLE_SCRIPT } from "./theme.ts";
import { renderToc, TOC_SCRIPT } from "./toc.ts";
import { escapeHtml, plainTextOf } from "./util.ts";

interface Section {
  heading: HeadingNode;
  blocks: Block[];
}

// Splits the body on h2 boundaries: everything before the first h2 is `pre`, and each h2 (plus
// whatever follows it up to the next h2) becomes one section a note control can attach to.
function splitSections(body: Block[]): { pre: Block[]; sections: Section[] } {
  const pre: Block[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const b of body) {
    if (b.type === "heading" && b.level === 2) {
      current = { heading: b, blocks: [b] };
      sections.push(current);
    } else if (current) {
      current.blocks.push(b);
    } else {
      pre.push(b);
    }
  }
  return { pre, sections };
}

export function render(doc: Doc, ledger: Ledger | null, opts: RenderOptions): string {
  const ctx = createCtx(ledger, opts);
  const notesEnabled = doc.frontmatter.extra.notes === true;

  const title = doc.frontmatter.title ?? "";
  const summary = doc.frontmatter.summary ?? "";
  const banner = opts.banner ? renderBanner(opts.banner) : "";
  const notesToolbar = notesEnabled ? renderNotesToolbar() : "";
  const header = `<header class="doc-header">${banner}<h1>${escapeHtml(title)}</h1>${summary ? `<p class="doc-summary">${escapeHtml(summary)}</p>` : ""}</header>`;

  const { rail, rest } = extractRail(doc.body);
  const railHtml = rail ? renderDirective(rail, ctx) : "";

  const { pre, sections } = splitSections(rest);
  const noteHeadings: NoteHeading[] = sections.map((s) => ({ slug: s.heading.id, title: plainTextOf(s.heading.children) }));
  const preHtml = renderBlocks(pre, ctx);
  const sectionsHtml = sections
    .map((s) => {
      const blocksHtml = s.blocks.map((b) => renderBlock(b, ctx)).join("\n");
      const control = notesEnabled ? renderNoteControl(s.heading.id, plainTextOf(s.heading.children)) : "";
      return `<section class="doc-section" data-slug="${s.heading.id}">\n${blocksHtml}\n${control}\n</section>`;
    })
    .join("\n");
  const claimsHtml = renderClaimsList(doc.claimRefs.map((r) => r.id), ctx);
  const body = [preHtml, sectionsHtml, claimsHtml].filter((s) => s.length > 0).join("\n");

  const toc = renderToc(doc.headings, claimsHtml.length > 0);
  const themeButton = `<button type="button" class="theme-toggle" aria-label="Toggle color theme">Theme</button>\n`;
  const sideContent = railHtml + toc + notesToolbar;
  const side = sideContent ? `<aside class="side-col">${themeButton}${sideContent}</aside>` : "";
  const nav = opts.nav ? renderNav(opts.nav) : "";

  const themeAttr = opts.theme === "light" || opts.theme === "dark" ? ` data-theme="${opts.theme}"` : "";
  const liveReload = opts.liveReload ? renderLiveReloadScript(opts.liveReload) : "";
  const tocScript = toc ? `<script>${TOC_SCRIPT}</script>\n` : "";
  const claimScript = claimsHtml ? `<script>${CLAIM_PANEL_SCRIPT}</script>\n` : "";
  const notesScript = notesEnabled ? `<script>${renderNotesScript(doc.path, noteHeadings)}</script>\n` : "";

  return (
    `<!doctype html>\n` +
    `<html lang="en"${themeAttr}>\n` +
    `<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${escapeHtml(title)}</title>\n` +
    `<style>${THEME_CSS}</style>\n` +
    `</head>\n` +
    `<body class="${opts.nav ? "has-nav" : "no-nav"}">\n` +
    (side ? "" : themeButton) +
    nav +
    `<div class="layout">\n` +
    `<main>\n${header}\n${body}\n</main>\n` +
    side +
    `</div>\n` +
    `<script>${THEME_TOGGLE_SCRIPT}</script>\n` +
    tocScript +
    claimScript +
    notesScript +
    liveReload +
    `</body>\n` +
    `</html>\n`
  );
}

function renderLiveReloadScript(endpoint: string): string {
  const safe = JSON.stringify(endpoint);
  return `<script>(function(){try{var es=new EventSource(${safe});es.onmessage=function(){location.reload();};}catch(e){}})();</script>\n`;
}
