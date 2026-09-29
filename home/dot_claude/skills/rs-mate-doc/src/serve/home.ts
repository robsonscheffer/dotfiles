// Renders the viewer's "/" home page: every doc set, loose page, walk, and legacy .html page it
// serves, with a kind filter and text search. The filter and search run client-side over data
// attributes already in the markup, so the page lists everything with the script off too.
import { THEME_CSS, THEME_TOGGLE_SCRIPT } from "../render/theme.ts";
import { INDEX_KINDS, type IndexEntry, type IndexKind } from "../index/types.ts";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function formatDate(mtimeMs: number): string {
  if (!mtimeMs) return "";
  return new Date(mtimeMs).toISOString().slice(0, 10);
}

function renderEntry(entry: IndexEntry): string {
  const summary = entry.summary ? `<p class="doc-summary">${esc(entry.summary)}</p>` : "";
  const level = entry.level ? ` <span class="status-banner status-${esc(entry.level)}">${esc(entry.level)}</span>` : "";
  const freshBadge =
    entry.fresh === undefined ? "" : entry.fresh ? ` <span class="status-banner status-fresh">fresh</span>` : ` <span class="status-banner status-stale">stale</span>`;
  const prBadge = entry.pr ? ` <span class="pr-label">${esc(entry.pr)}</span>` : "";
  const updated = formatDate(entry.updated);
  return `<li class="index-entry" data-kind="${esc(entry.kind)}" data-title="${esc(entry.title.toLowerCase())}" data-summary="${esc((entry.summary ?? "").toLowerCase())}">
<a href="${esc(entry.href)}">${esc(entry.title)}</a>${level}${freshBadge}${prBadge}
${summary}
<p class="index-updated">${esc(updated)}</p>
</li>`;
}

function renderFilterOptions(): string {
  return INDEX_KINDS.map((k: IndexKind) => `<option value="${esc(k)}">${esc(k)}</option>`).join("\n");
}

const FILTER_SCRIPT = `(function(){
  var search = document.getElementById('index-search');
  var kindSelect = document.getElementById('index-kind');
  var items = Array.prototype.slice.call(document.querySelectorAll('.index-entry'));
  function apply() {
    var q = (search.value || '').toLowerCase();
    var kind = kindSelect.value;
    items.forEach(function (li) {
      var matchesKind = kind === '' || li.getAttribute('data-kind') === kind;
      var matchesQuery = q === '' || li.getAttribute('data-title').indexOf(q) !== -1 || li.getAttribute('data-summary').indexOf(q) !== -1;
      li.style.display = matchesKind && matchesQuery ? '' : 'none';
    });
  }
  search.addEventListener('input', apply);
  kindSelect.addEventListener('change', apply);
})();`;

export function renderHome(entries: IndexEntry[]): string {
  const items = entries.map(renderEntry).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mate-doc</title>
<style>${THEME_CSS}
.index-controls { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; }
.index-controls input, .index-controls select { padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); }
.index-list { list-style: none; padding: 0; }
.index-entry { border-bottom: 1px solid var(--border); padding: 0.6rem 0; }
.index-updated { color: var(--muted); font-size: 0.8rem; margin: 0.2rem 0 0; }
.pr-label { font-size: 0.85rem; color: var(--muted); }
.status-fresh { background: var(--callout-bg); }
.status-stale { border-color: var(--badge-high); color: var(--badge-high); }
</style>
</head>
<body class="no-nav">
<button type="button" class="theme-toggle" aria-label="Toggle color theme">Theme</button>
<div class="layout"><main>
<header class="doc-header"><h1>mate-doc</h1></header>
<div class="index-controls">
<input type="search" id="index-search" placeholder="Search title and summary">
<select id="index-kind"><option value="">All kinds</option>${renderFilterOptions()}</select>
</div>
<ul class="index-list">${items}</ul>
</main></div>
<script>${THEME_TOGGLE_SCRIPT}</script>
<script>${FILTER_SCRIPT}</script>
</body>
</html>`;
}
