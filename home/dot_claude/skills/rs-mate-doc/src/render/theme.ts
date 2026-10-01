// Theme tokens as CSS custom properties, light and dark. No embedded font: the stack below is
// system fonts only (see the report from this lane for why: no OFL-licensed webfont was
// available to vendor into a self-contained page without adding a new dependency).

export const THEME_CSS = `
:root {
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #5a5a5a;
  --accent: #2563eb;
  --border: #d8d8d8;
  --callout-bg: #f4f5f7;
  --code-bg: #f4f5f7;
  --flow-fill: transparent;
  --badge-high: #b3261e;
  --badge-med: #8a6d00;
  --badge-low: #1e6b3a;
  /* Foreground-text variants of the badge colors: --badge-high/-med/-low are also used as
     backgrounds behind white text (.badge-*, .risk-badge), where the raw values already pass
     4.5:1. As plain text on --bg they only pass in light theme; the dark overrides below use
     brighter shades so claim markers, unresolved links, tile deltas, and callout borders stay
     readable on the dark background too. */
  --badge-high-text: #b3261e;
  --badge-med-text: #8a6d00;
  --badge-low-text: #1e6b3a;
  --code-comment: #6a737d;
  --code-keyword: #a626a4;
  --code-string: #50a14f;
  --code-number: #986801;
  --code-title: #4078f2;
  --diff-add-bg: #e6f4ea;
  --diff-del-bg: #fdecea;
  --diff-hunk-bg: #eef2fc;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161a;
    --fg: #e8e8e8;
    --muted: #a0a0a0;
    --accent: #7aa2ff;
    --border: #33363c;
    --callout-bg: #1d2025;
    --code-bg: #1d2025;
    --badge-high-text: #ff8a80;
    --badge-med-text: #ffca5c;
    --badge-low-text: #5fd38d;
    --code-comment: #8b98a8;
    --code-keyword: #d18fd1;
    --code-string: #98c379;
    --code-number: #d19a66;
    --code-title: #7aa2ff;
    --diff-add-bg: #1b3326;
    --diff-del-bg: #3a1f22;
    --diff-hunk-bg: #222a3a;
  }
}
html[data-theme="dark"] {
  --bg: #14161a;
  --fg: #e8e8e8;
  --muted: #a0a0a0;
  --accent: #7aa2ff;
  --border: #33363c;
  --callout-bg: #1d2025;
  --code-bg: #1d2025;
  --badge-high-text: #ff8a80;
  --badge-med-text: #ffca5c;
  --badge-low-text: #5fd38d;
  --code-comment: #8b98a8;
  --code-keyword: #d18fd1;
  --code-string: #98c379;
  --code-number: #d19a66;
  --code-title: #7aa2ff;
  --diff-add-bg: #1b3326;
  --diff-del-bg: #3a1f22;
  --diff-hunk-bg: #222a3a;
}
html[data-theme="light"] {
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #5a5a5a;
  --accent: #2563eb;
  --border: #d8d8d8;
  --callout-bg: #f4f5f7;
  --code-bg: #f4f5f7;
  --badge-high-text: #b3261e;
  --badge-med-text: #8a6d00;
  --badge-low-text: #1e6b3a;
  --code-comment: #6a737d;
  --code-keyword: #a626a4;
  --code-string: #50a14f;
  --code-number: #986801;
  --code-title: #4078f2;
  --diff-add-bg: #e6f4ea;
  --diff-del-bg: #fdecea;
  --diff-hunk-bg: #eef2fc;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.55;
}
main, .left-nav, .toc { padding: 1.5rem; }
main { overflow-wrap: break-word; }
.layout { display: flex; align-items: flex-start; gap: 1rem; max-width: 1360px; margin-inline: auto; }
.layout main { flex: 1 1 auto; min-width: 0; }
.side-col { flex: 0 0 220px; position: sticky; top: 0; align-self: flex-start; display: flex; flex-direction: column; gap: 1rem; }
.toc summary { cursor: pointer; font-weight: 600; margin-bottom: 0.4rem; }
.toc ul { list-style: none; padding-left: 1rem; margin: 0; }
.toc > ul { padding-left: 0; }
.toc a { color: var(--muted); text-decoration: none; }
.toc a:hover { color: var(--accent); }
/* Reading width: a text column of about 70 characters. Wide content (tables, code, diagrams,
   tiles, cards, tabs, risks) opts back out to the full width main has available. */
main :is(p, ul, ol, dl, blockquote, .callout, .doc-summary, .decide-owner, h1, h2, h3, h4, h5, h6) {
  max-width: 70ch;
}
main :is(table, pre, figure.code-block, .tiles, .flow-diagram, .cards, .tab-panels, .risks) {
  max-width: none;
}
/* One breakpoint for the whole layout: side-col (rail + TOC) and the left-nav both react to it,
   below 900px, everything narrower than that stacks single-column above the main content. */
@media (max-width: 900px) {
  .layout { flex-direction: column; align-items: stretch; }
  .side-col { position: static; width: 100%; order: -1; }
  .left-nav { width: 100%; border-right: none; border-bottom: 1px solid var(--border); }
}
.rail { border: 1px solid var(--border); border-radius: 6px; padding: 1rem; }
.rail-list { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.75rem; margin: 0; }
.rail-key { color: var(--muted); font-size: 0.85rem; }
.rail-value { margin: 0; text-align: right; }
.notes-toolbar { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.notes-copy-btn, .notes-download-btn {
  background: var(--callout-bg);
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: 4px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.note-control { margin: 0.75rem 0 1.5rem; }
.note-toggle {
  background: none;
  border: 1px dashed var(--border);
  color: var(--muted);
  border-radius: 4px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.note-textarea {
  display: block;
  width: 100%;
  min-height: 5rem;
  margin-top: 0.5rem;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.5rem;
  font: inherit;
}
/* One focus style for the whole page: every link, button, and summary gets the same visible
   outline in both themes. */
a:focus-visible, button:focus-visible, summary:focus-visible,
input:focus-visible, textarea:focus-visible, select:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.left-nav { flex: 0 0 200px; border-right: 1px solid var(--border); }
.left-nav ul { list-style: none; padding: 0; margin: 0; }
.left-nav li.current a { color: var(--accent); font-weight: 600; }
.breadcrumbs { padding: 0.75rem 1.5rem 0; color: var(--muted); font-size: 0.9rem; }
.breadcrumbs a { color: var(--muted); }
.prev-next { display: flex; justify-content: space-between; padding: 1.5rem; border-top: 1px solid var(--border); }
a { color: var(--accent); }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
h2, h3 { scroll-margin-top: 1rem; }
.anchor { margin-left: 0.4rem; opacity: 0; text-decoration: none; color: var(--muted); }
h1:hover .anchor, h2:hover .anchor, h3:hover .anchor,
h4:hover .anchor, h5:hover .anchor, h6:hover .anchor { opacity: 1; }
.doc-header { margin-bottom: 1.5rem; }
.doc-summary { color: var(--muted); }
.status-banner {
  display: inline-block;
  font-size: 0.85rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  background: var(--callout-bg);
  border: 1px solid var(--border);
  margin-bottom: 0.75rem;
}
.callout {
  border: 1px solid var(--border);
  border-left-width: 4px;
  background: var(--callout-bg);
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin: 1rem 0;
}
.callout-title { font-weight: 600; margin: 0 0 0.4rem; }
.callout-means { border-left-color: var(--accent); }
.callout-warn { border-left-color: var(--badge-high-text); }
.callout-note { border-left-color: var(--code-title); }
.callout-collide { border-left-color: var(--badge-med-text); }
.callout-decide { border-left-color: var(--badge-med-text); }
.term-chip { border-bottom: 1px dotted var(--accent); cursor: help; }
.claim-marker { text-decoration: none; }
.claim-marker:hover { text-decoration: underline; }
.claim-marker.claim-verified, .claim-marker.verdict-supports,
.claim-status-verified, .verdict-badge.verdict-supports { color: var(--badge-low-text); }
.claim-marker.claim-proposed, .claim-marker.claim-inferred,
.claim-marker.verdict-unrelated, .claim-marker.verdict-uncheckable,
.claim-status-proposed, .claim-status-inferred,
.verdict-badge.verdict-unrelated, .verdict-badge.verdict-uncheckable { color: var(--badge-med-text); }
.claim-marker.claim-not_verified, .claim-marker.claim-missing,
.claim-marker.verdict-overstates, .claim-marker.verdict-contradicts,
.claim-status-not_verified, .verdict-badge.verdict-overstates, .verdict-badge.verdict-contradicts { color: var(--badge-high-text); }
.claim-marker.claim-not_verified, .claim-marker.claim-missing { font-weight: 700; }
.claim-marker.claim-missing::after { content: " !"; }
.claim-status {
  text-transform: uppercase;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  border: 1px solid var(--border);
}
.claim-text { color: var(--fg); }
.claims-list { margin-top: 2rem; }
.claims-list .claim-row { margin: 0.4rem 0; padding: 0.4rem 0.6rem; }
.claims-list .claim-row:target { background: var(--callout-bg); border-left-color: var(--accent); }
.claim-panel {
  display: block;
  position: absolute;
  z-index: 20;
  max-width: 28rem;
  padding: 0.6rem 0.8rem;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.claim-panel .claim-evidence { margin: 0.4rem 0; }
.claim-panel .claim-excerpt { white-space: pre-wrap; }
.claim-panel-close { float: right; margin-left: 0.5rem; cursor: pointer; }
.claim-evidence {
  font-size: 0.85rem;
  color: var(--muted);
  border-left: 2px solid var(--border);
  padding-left: 0.6rem;
  margin: 0.2rem 0 0.9rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.claim-source {
  flex: 1 1 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8rem;
}
.claim-evidence-missing { color: var(--badge-high-text); border-left-color: var(--badge-high-text); }
.claim-excerpt { background: var(--code-bg); padding: 0.1rem 0.3rem; border-radius: 3px; }
.verdict-badge {
  text-transform: uppercase;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: var(--callout-bg);
  border: 1px solid var(--border);
}
.tiles { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1rem 0; }
.tile { border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem 1rem; min-width: 120px; }
.tile-value { font-size: 1.4rem; font-weight: 700; }
.tile-delta { font-size: 0.85rem; font-weight: 600; margin-top: 0.15rem; }
.tile-delta-good { color: var(--badge-low-text); }
.tile-delta-bad { color: var(--badge-high-text); }
.tile-label { color: var(--muted); font-size: 0.85rem; }
.badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;
  padding: 0.05rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  white-space: nowrap;
}
.badge-good { background: var(--badge-low); border-color: var(--badge-low); color: #fff; }
.badge-warn { background: var(--badge-med); border-color: var(--badge-med); color: #fff; }
.badge-bad { background: var(--badge-high); border-color: var(--badge-high); color: #fff; }
.badge-info { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.badge-neutral { background: var(--callout-bg); color: var(--fg); }
.flow-diagram { max-width: 100%; height: auto; margin: 1rem 0; }
.steps { padding-left: 0; list-style: none; }
.step { display: flex; align-items: baseline; gap: 0.75rem; margin: 0.75rem 0; }
.step-body { min-width: 0; overflow-wrap: anywhere; }
.step-number {
  flex: 0 0 auto;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  background: var(--accent);
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}
.tabs { margin: 1rem 0; }
.tab-buttons { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--border); }
.tab-btn { background: none; border: none; padding: 0.5rem 0.9rem; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; }
.tab-btn[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
.tab-panel { padding: 0.75rem 0; }
.cards { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1rem 0; }
.card { border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem 1rem; text-decoration: none; flex: 1 1 200px; }
.decide-owner { font-weight: 600; margin: 0.5rem 0 0; }
.reveal { border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.9rem; margin: 1rem 0; }
.reveal > summary { cursor: pointer; font-weight: 600; }
.reveal-body { margin-top: 0.6rem; }
.sealed-gate, .sealed-result { margin: 1rem 0; }
.sealed-options { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.sealed-option { font: inherit; padding: 0.3rem 0.9rem; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.checks { width: 100%; }
.timeline { list-style: none; margin: 1rem 0; padding-left: 1.25rem; border-left: 2px solid var(--border); }
.timeline-item { position: relative; margin: 0 0 1rem; }
.timeline-item:last-child { margin-bottom: 0; }
.timeline-item::before {
  content: "";
  position: absolute;
  left: -1.5rem;
  top: 0.3rem;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--accent);
}
.timeline-date { display: block; font-size: 0.85rem; color: var(--muted); font-weight: 600; }
.timeline-text { margin-top: 0.1rem; }
.progress { display: flex; align-items: center; gap: 0.6rem; margin: 1rem 0; }
.progress-track {
  flex: 1 1 auto;
  height: 0.6rem;
  border-radius: 999px;
  background: var(--callout-bg);
  border: 1px solid var(--border);
  overflow: hidden;
}
.progress-fill { height: 100%; background: var(--accent); }
.progress-label { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
.risk-badge { font-weight: 700; padding: 0.1rem 0.5rem; border-radius: 3px; color: #fff; }
.risk-badge.risk-high { background: var(--badge-high); }
.risk-badge.risk-med { background: var(--badge-med); }
.risk-badge.risk-low { background: var(--badge-low); }
.risk-cards { display: flex; flex-direction: column; gap: 0.6rem; margin: 1rem 0; }
.risk-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 1rem;
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 4px;
  padding: 0.6rem 0.9rem;
}
.risk-card.risk-high { border-left-color: var(--badge-high-text); }
.risk-card.risk-med { border-left-color: var(--badge-med-text); }
.risk-card.risk-low { border-left-color: var(--badge-low-text); }
.risk-field { display: flex; align-items: baseline; gap: 0.3rem; }
.risk-field-label { color: var(--muted); font-size: 0.8rem; }
.not-verified-list { list-style: none; padding: 0; }
.not-verified-list li { border-bottom: 1px solid var(--border); padding: 0.4rem 0; }
.claim-owner { color: var(--muted); }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid var(--border); padding: 0.4rem 0.6rem; text-align: left; overflow-wrap: break-word; vertical-align: top; }
pre { background: var(--code-bg); border-radius: 6px; padding: 0.75rem 1rem; overflow-x: auto; font-size: 0.85rem; line-height: 1.45; }
figure.code-block { margin: 1rem 0; }
figure.code-block figcaption { font-size: 0.85rem; color: var(--muted); margin-bottom: 0.25rem; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.diff-file {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8rem;
  background: var(--callout-bg);
  color: var(--fg);
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  overflow-wrap: anywhere;
}
figure.diff pre { margin: 0; border: 1px solid var(--border); border-radius: 0 0 6px 6px; padding-left: 0; }
figure.diff:not(:has(.diff-file)) pre { border-radius: 6px; }
figure.diff pre code { display: block; min-width: 100%; width: max-content; padding-right: 1rem; }
.diff code > span { display: block; min-height: 1.45em; white-space: pre; }
.diff .diff-add { color: var(--badge-low-text); background: var(--diff-add-bg); }
.diff .diff-del { color: var(--badge-high-text); background: var(--diff-del-bg); }
.diff .diff-ctx { color: var(--fg); }
.diff .diff-hunk { color: var(--accent); background: var(--diff-hunk-bg); }
.diff .diff-num { display: inline-block; width: 4ch; text-align: right; padding-right: 0.5ch; color: var(--muted); user-select: none; }
.diff .diff-num-new { border-right: 1px solid var(--border); margin-right: 0.6rem; }
.diff .diff-sign { user-select: none; }
.hljs-comment, .hljs-quote { color: var(--code-comment); }
.hljs-keyword, .hljs-selector-tag, .hljs-literal { color: var(--code-keyword); }
.hljs-string, .hljs-attr { color: var(--code-string); }
.hljs-number { color: var(--code-number); }
.hljs-title, .hljs-title.class_, .hljs-title.function_ { color: var(--code-title); }
.link-unresolved { color: var(--badge-high-text); border-bottom: 1px dotted var(--badge-high-text); }
.directive-unknown, .directive-unhandled, .doc-error {
  border: 1px solid var(--badge-high-text);
  color: var(--badge-high-text);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  margin: 1rem 0;
}
.theme-toggle {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  background: var(--callout-bg);
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: 4px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  z-index: 10;
}
.left-nav-disclosure summary { cursor: pointer; font-weight: 600; padding: 0.25rem 0; }
@media print {
  .breadcrumbs, .left-nav, .prev-next, .side-col, .theme-toggle,
  .notes-toolbar, .note-control, .claim-panel, .sealed-gate {
    display: none !important;
  }
  .sealed-body[hidden] { display: block !important; }
  /* Print has no interaction, so a collapsed <details> (e.g. the walk lane's judgment reveal)
     must show its content and the toggle it would otherwise need loses its purpose. */
  details:not([open]) summary { display: none; }
  details:not([open]) > *:not(summary) { display: block !important; }
  a:not([href^="/"]):not([href^="#"])::after {
    content: " (" attr(href) ")";
    font-size: 0.85em;
    color: var(--muted);
  }
  table, figure.code-block, pre {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`;

export const THEME_TOGGLE_SCRIPT = `(function(){
  var btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var html = document.documentElement;
    var cur = html.getAttribute('data-theme');
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var effectiveDark = cur === 'dark' || (cur !== 'light' && systemDark);
    html.setAttribute('data-theme', effectiveDark ? 'light' : 'dark');
  });
})();`;
