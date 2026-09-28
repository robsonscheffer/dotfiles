import type { Doc, Ledger, RenderOptions } from "../types.ts";
import { renderBanner } from "./banner.ts";
import { renderBlocks } from "./block.ts";
import { createCtx } from "./ctx.ts";
import { renderNav } from "./nav.ts";
import { THEME_CSS, THEME_TOGGLE_SCRIPT } from "./theme.ts";
import { renderToc } from "./toc.ts";
import { escapeHtml } from "./util.ts";

export function render(doc: Doc, ledger: Ledger | null, opts: RenderOptions): string {
  const ctx = createCtx(ledger, opts);

  const title = doc.frontmatter.title ?? "";
  const summary = doc.frontmatter.summary ?? "";
  const banner = opts.banner ? renderBanner(opts.banner) : "";
  const header = `<header class="doc-header">${banner}<h1>${escapeHtml(title)}</h1>${summary ? `<p class="doc-summary">${escapeHtml(summary)}</p>` : ""}</header>`;

  const body = renderBlocks(doc.body, ctx);
  const toc = renderToc(doc.headings);
  const nav = opts.nav ? renderNav(opts.nav) : "";

  const themeAttr = opts.theme === "light" || opts.theme === "dark" ? ` data-theme="${opts.theme}"` : "";
  const liveReload = opts.liveReload ? renderLiveReloadScript(opts.liveReload) : "";

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
    `<button type="button" class="theme-toggle" aria-label="Toggle color theme">Theme</button>\n` +
    nav +
    `<div class="layout">\n` +
    `<main>\n${header}\n${body}\n</main>\n` +
    toc +
    `</div>\n` +
    `<script>${THEME_TOGGLE_SCRIPT}</script>\n` +
    liveReload +
    `</body>\n` +
    `</html>\n`
  );
}

function renderLiveReloadScript(endpoint: string): string {
  const safe = JSON.stringify(endpoint);
  return `<script>(function(){try{var es=new EventSource(${safe});es.onmessage=function(){location.reload();};}catch(e){}})();</script>\n`;
}
