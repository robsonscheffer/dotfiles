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
  --code-comment: #6a737d;
  --code-keyword: #a626a4;
  --code-string: #50a14f;
  --code-number: #986801;
  --code-title: #4078f2;
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
    --code-comment: #8b98a8;
    --code-keyword: #d18fd1;
    --code-string: #98c379;
    --code-number: #d19a66;
    --code-title: #7aa2ff;
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
  --code-comment: #8b98a8;
  --code-keyword: #d18fd1;
  --code-string: #98c379;
  --code-number: #d19a66;
  --code-title: #7aa2ff;
}
html[data-theme="light"] {
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #5a5a5a;
  --accent: #2563eb;
  --border: #d8d8d8;
  --callout-bg: #f4f5f7;
  --code-bg: #f4f5f7;
  --code-comment: #6a737d;
  --code-keyword: #a626a4;
  --code-string: #50a14f;
  --code-number: #986801;
  --code-title: #4078f2;
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
.layout { display: flex; align-items: flex-start; gap: 1rem; }
.layout main { flex: 1 1 auto; min-width: 0; }
.side-col { flex: 0 0 220px; position: sticky; top: 0; align-self: flex-start; display: flex; flex-direction: column; gap: 1rem; }
.toc ul { list-style: none; padding-left: 1rem; margin: 0; }
.toc > ul { padding-left: 0; }
.toc a { color: var(--muted); text-decoration: none; }
.toc a:hover { color: var(--accent); }
@media (max-width: 760px) {
  .layout { flex-direction: column; }
  .side-col { position: static; width: 100%; order: -1; }
}
.rail { border: 1px solid var(--border); border-radius: 6px; padding: 1rem; }
.rail-list { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.75rem; margin: 0; }
.rail-key { color: var(--muted); font-size: 0.85rem; }
.rail-value { margin: 0; text-align: right; }
.notes-toolbar { display: none; gap: 0.5rem; margin-top: 0.5rem; }
.js .notes-toolbar { display: flex; }
.notes-copy-btn, .notes-download-btn {
  background: var(--callout-bg);
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: 4px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.note-control { display: none; margin: 0.75rem 0 1.5rem; }
.js .note-control { display: block; }
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
.note-toggle:focus-visible, .note-textarea:focus-visible,
.notes-copy-btn:focus-visible, .notes-download-btn:focus-visible {
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
.callout-warn { border-left-color: var(--badge-high); }
.callout-note { border-left-color: var(--code-title); }
.callout-collide { border-left-color: var(--badge-med); }
.callout-decide { border-left-color: var(--badge-med); }
.term-chip { border-bottom: 1px dotted var(--accent); cursor: help; }
.claim-marker { cursor: help; }
.claim-marker.claim-not_verified, .claim-marker.claim-missing { color: var(--badge-high); font-weight: 700; }
.claim-marker.claim-missing::after { content: " !"; }
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
.claim-evidence-missing { color: var(--badge-high); border-left-color: var(--badge-high); }
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
.tile-delta-good { color: var(--badge-low); }
.tile-delta-bad { color: var(--badge-high); }
.tile-label { color: var(--muted); font-size: 0.85rem; }
.badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;
  padding: 0.05rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.badge-good { background: var(--badge-low); border-color: var(--badge-low); color: #fff; }
.badge-warn { background: var(--badge-med); border-color: var(--badge-med); color: #fff; }
.badge-bad { background: var(--badge-high); border-color: var(--badge-high); color: #fff; }
.badge-info { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.badge-neutral { background: var(--callout-bg); color: var(--fg); }
.flow-diagram { max-width: 100%; height: auto; margin: 1rem 0; }
.steps { padding-left: 0; list-style: none; }
.step { display: flex; align-items: baseline; gap: 0.75rem; margin: 0.75rem 0; }
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
.risk-badge { font-weight: 700; padding: 0.1rem 0.5rem; border-radius: 3px; color: var(--bg); }
.risk-badge.risk-high { background: var(--badge-high); }
.risk-badge.risk-med { background: var(--badge-med); }
.risk-badge.risk-low { background: var(--badge-low); }
.not-verified-list { list-style: none; padding: 0; }
.not-verified-list li { border-bottom: 1px solid var(--border); padding: 0.4rem 0; }
.claim-owner { color: var(--muted); }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid var(--border); padding: 0.4rem 0.6rem; text-align: left; }
pre { background: var(--code-bg); border-radius: 6px; padding: 0.75rem 1rem; overflow-x: auto; }
figure.code-block { margin: 1rem 0; }
figure.code-block figcaption { font-size: 0.85rem; color: var(--muted); margin-bottom: 0.25rem; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.diff .diff-add { color: var(--badge-low); display: block; }
.diff .diff-del { color: var(--badge-high); display: block; }
.diff .diff-ctx { color: var(--fg); display: block; }
.hljs-comment, .hljs-quote { color: var(--code-comment); }
.hljs-keyword, .hljs-selector-tag, .hljs-literal { color: var(--code-keyword); }
.hljs-string, .hljs-attr { color: var(--code-string); }
.hljs-number { color: var(--code-number); }
.hljs-title, .hljs-title.class_, .hljs-title.function_ { color: var(--code-title); }
.link-unresolved { color: var(--badge-high); border-bottom: 1px dotted var(--badge-high); }
.directive-unknown, .directive-unhandled, .doc-error {
  border: 1px solid var(--badge-high);
  color: var(--badge-high);
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
