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
    `<nav class="left-nav" aria-label="Sections"><ul>${pages}</ul></nav>` +
    `<nav class="prev-next" aria-label="Adjacent pages">${prev}${next}</nav>`
  );
}
