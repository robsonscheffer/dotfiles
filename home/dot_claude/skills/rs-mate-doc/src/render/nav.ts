import type { NavInfo } from "../types.ts";
import { escapeAttr, escapeHtml } from "./util.ts";

export function renderNav(nav: NavInfo): string {
  const breadcrumbs = nav.breadcrumbs.map((b) => `<a href="${escapeAttr(b.href)}">${escapeHtml(b.title)}</a>`).join(' <span class="crumb-sep">/</span> ');
  const pages = nav.pages
    .map(
      (p) =>
        `<li class="${p.current ? "current" : ""}"><a href="${escapeAttr(p.href)}"${p.current ? ' aria-current="page"' : ""}>${escapeHtml(p.title)}</a></li>`,
    )
    .join("");
  const prev = nav.prev ? `<a class="prev-link" href="${escapeAttr(nav.prev.href)}">&larr; ${escapeHtml(nav.prev.title)}</a>` : "";
  const next = nav.next ? `<a class="next-link" href="${escapeAttr(nav.next.href)}">${escapeHtml(nav.next.title)} &rarr;</a>` : "";
  return (
    `<nav class="breadcrumbs" aria-label="Breadcrumb">${breadcrumbs}</nav>` +
    // A native <details> works as a collapsible disclosure below the narrow breakpoint and as
    // an always-open list above it, with no script required either way.
    `<nav class="left-nav" aria-label="Sections"><details class="left-nav-disclosure" open><summary>Sections</summary><ul>${pages}</ul></details></nav>` +
    `<nav class="prev-next" aria-label="Adjacent pages">${prev}${next}</nav>`
  );
}
