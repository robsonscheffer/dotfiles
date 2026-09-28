// The HTML page: one self-contained file, inline CSS and a small inline
// script for hover/copy, no external URLs. Renders the one report object
// only (D2) - every chart and table below reads from `report`, none
// recomputes.

import type { Report, Session } from "../types.ts";
import { windowLabel } from "../date.ts";
import {
  CAUSE_LABEL,
  CAUSE_VAR,
  copyButton,
  escapeXml,
  HEAVY_CONTEXT_TOKENS,
  legend,
  sessionContextLine,
  TOKEN_KIND_LABEL,
  TOKEN_KIND_ORDER,
  TOKEN_KIND_VAR,
  usd,
} from "./charts.ts";

const MAX_SESSIONS_SHOWN = 6;
const MAX_WHATIF_MODELS = 4;

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

const STYLE = `
:root {
  color-scheme: light;
  --surface-1: #fcfcfb;
  --page-plane: #f9f9f7;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #898781;
  --gridline: #e1e0d9;
  --baseline: #c3c2b7;
  --border: rgba(11,11,11,0.10);
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --series-4: #eda100;
  --series-5: #e87ba4;
  --status-good: #0ca30c;
  --status-warning: #fab219;
  --status-serious: #ec835a;
  --status-critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --surface-1: #1a1a19;
    --page-plane: #0d0d0d;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --gridline: #2c2c2a;
    --baseline: #383835;
    --border: rgba(255,255,255,0.10);
    --series-1: #3987e5;
    --series-2: #d95926;
    --series-3: #199e70;
    --series-4: #c98500;
    --series-5: #d55181;
    --status-good: #0ca30c;
    --status-warning: #fab219;
    --status-serious: #ec835a;
    --status-critical: #d03b3b;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface-1: #1a1a19;
  --page-plane: #0d0d0d;
  --text-primary: #ffffff;
  --text-secondary: #c3c2b7;
  --text-muted: #898781;
  --gridline: #2c2c2a;
  --baseline: #383835;
  --border: rgba(255,255,255,0.10);
  --series-1: #3987e5;
  --series-2: #d95926;
  --series-3: #199e70;
  --series-4: #c98500;
  --series-5: #d55181;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--page-plane);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
.page { max-width: 1080px; margin: 0 auto; padding: 0 24px 48px; }
.tabular { font-variant-numeric: tabular-nums; }
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  background: var(--page-plane);
  border-bottom: 1px solid var(--border);
  padding: 12px 24px;
  margin: 0 -24px 24px;
}
.topbar h1 { font-size: 22px; font-weight: 600; margin: 0; white-space: nowrap; }
.topbar .meta { color: var(--text-secondary); font-size: 13px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.topbar nav { display: flex; gap: 14px; font-size: 12px; margin-left: 8px; }
.topbar nav a { color: var(--text-secondary); text-decoration: none; }
.topbar nav a:hover { color: var(--text-primary); }
.topbar .spacer { flex: 1; }
.chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  white-space: nowrap;
}
.chip-pass { color: var(--status-good); border-color: var(--status-good); }
.chip-warn { color: var(--status-serious); border-color: var(--status-serious); }
.segmented {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 7px;
  overflow: hidden;
  font-size: 12px;
}
.segmented button {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 4px 10px;
  cursor: pointer;
  font: inherit;
}
.segmented button[aria-pressed="true"] { background: var(--surface-1); color: var(--text-primary); font-weight: 600; }
section { margin: 32px 0; }
h2.section-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin: 0 0 10px;
}
.card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.kpi-tile { background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
.kpi-tile .value { font-size: 24px; font-weight: 600; }
.kpi-tile .label { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.kpi-tile .caption { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.headline-row { display: grid; grid-template-columns: 2.4fr 1fr; gap: 8px; align-items: stretch; margin-bottom: 32px; }
.top-finding { background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.top-finding .kicker { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.top-finding .title { font-size: 14px; font-weight: 600; }
.top-finding .dollars { font-size: 18px; font-weight: 600; }
.top-finding .action { font-size: 12px; color: var(--text-secondary); }
.mini-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
.mini-tile { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; }
.mini-tile .value { font-size: 16px; font-weight: 600; }
.mini-tile .label { font-size: 11px; color: var(--text-secondary); }
table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--gridline); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
th { color: var(--text-secondary); font-weight: 500; font-size: 12px; }
.axis-label { font-size: 10px; fill: var(--text-secondary); font-family: system-ui, sans-serif; }
details.table-toggle summary { cursor: pointer; color: var(--text-secondary); font-size: 12px; margin-top: 8px; list-style: none; }
details.table-toggle summary::-webkit-details-marker { display: none; }
details.table-toggle summary::before { content: "\\25B8  "; }
details.table-toggle[open] summary::before { content: "\\25BE  "; }
.chart { display: block; }
.warning-banner {
  background: var(--status-warning);
  color: #0b0b0b;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 16px;
}
footer { color: var(--text-muted); font-size: 12px; margin-top: 32px; }
code { background: var(--gridline); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; margin: 10px 0 0; color: var(--text-secondary); }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.legend-value { color: var(--text-primary); }
.swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.hatch { background-image: repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 5px); }

/* Where it went: 24px stacked HTML bar */
.stack-bar { display: flex; height: 24px; border-radius: 4px; overflow: hidden; gap: 2px; }
.stack-seg { display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; min-width: 2px; }
.stack-seg .seg-label { padding: 0 6px; white-space: nowrap; overflow: hidden; }

/* Models: horizontal bar rows */
.hbar-row { display: grid; grid-template-columns: 160px 1fr 70px 46px; gap: 10px; align-items: center; padding: 3px 0; font-size: 13px; }
.hbar-track { height: 20px; background: var(--gridline); border-radius: 4px; overflow: hidden; }
.hbar-fill { height: 100%; border-radius: 4px; background: var(--series-1); }
.hbar-value { text-align: right; font-variant-numeric: tabular-nums; }
.hbar-share { text-align: right; color: var(--text-secondary); font-variant-numeric: tabular-nums; }

/* Context histogram: HTML/CSS bars, fixed 180px plot */
.histogram { position: relative; height: 180px; display: flex; align-items: flex-end; gap: 16px; padding-top: 20px; border-top: 1px solid var(--gridline); }
.histogram::before {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 50%;
  border-top: 1px solid var(--gridline);
}
.hist-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; }
.hist-value { font-size: 11px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.hist-bar { width: 100%; max-width: 72px; border-radius: 4px 4px 0 0; background: var(--series-1); }
.hist-bar.heavy { background: var(--series-2); }
.hist-label { font-size: 11px; color: var(--text-secondary); margin-top: 4px; text-align: center; }
.hist-annotation { font-size: 12px; color: var(--text-secondary); margin-top: 8px; }

/* Findings */
.finding-row { display: grid; grid-template-columns: 20px minmax(0,1.6fr) minmax(0,1.2fr) 70px 90px 50px; gap: 10px; align-items: center; padding: 7px 0; font-size: 13px; border-bottom: 1px solid var(--gridline); }
.finding-rank { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.finding-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.finding-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.finding-action { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.finding-track { height: 10px; background: var(--gridline); border-radius: 3px; overflow: hidden; }
.finding-bar { height: 100%; min-width: 2px; border-radius: 3px; background: var(--series-4); color: var(--series-4); }
.finding-value { white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; }
.finding-sessions { text-align: right; color: var(--text-secondary); font-variant-numeric: tabular-nums; }

/* What-if */
.whatif-bar { height: 8px; background: var(--series-1); border-radius: 3px; display: inline-block; vertical-align: middle; margin-left: 8px; }
.delta-up { color: var(--status-serious); }
.delta-down { color: var(--status-good); }

/* Sessions */
.session-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 12px; }
.session-card .session-header { font-size: 13px; margin-bottom: 6px; color: var(--text-secondary); }
.session-card .session-header strong { color: var(--text-primary); }
.resume-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.resume-cmd { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copy-btn {
  font-size: 11px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
}
.copy-btn[data-copied="true"] { color: var(--status-good); border-color: var(--status-good); }

/* Tooltip */
#tooltip {
  position: fixed;
  z-index: 100;
  pointer-events: none;
  background: var(--text-primary);
  color: var(--page-plane);
  font-size: 12px;
  padding: 5px 8px;
  border-radius: 5px;
  display: none;
  white-space: nowrap;
}
:root[data-theme="dark"] #tooltip { background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border); }
`;

const TOOLTIP_SCRIPT = `
(function () {
  var tip = document.getElementById("tooltip");
  if (!tip) return;
  function show(el, x, y) {
    var text = el.getAttribute("data-tip");
    if (!text) return;
    tip.textContent = text;
    tip.style.display = "block";
    tip.style.left = (x + 12) + "px";
    tip.style.top = (y + 12) + "px";
  }
  function hide() {
    tip.style.display = "none";
  }
  document.querySelectorAll("[data-tip]").forEach(function (el) {
    el.addEventListener("pointermove", function (e) {
      show(el, e.clientX, e.clientY);
    });
    el.addEventListener("pointerleave", hide);
    el.addEventListener("focus", function () {
      var rect = el.getBoundingClientRect();
      show(el, rect.left, rect.top);
    });
    el.addEventListener("blur", hide);
  });
  document.querySelectorAll(".copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy") || "";
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      btn.setAttribute("data-copied", "true");
      btn.textContent = "Copied";
      setTimeout(function () {
        btn.removeAttribute("data-copied");
        btn.textContent = "Copy";
      }, 1500);
    });
  });
})();
`;

const THEME_SCRIPT = `
(function () {
  var stored = null;
  try { stored = localStorage.getItem("rs-claude-cost-theme"); } catch (e) {}
  var mode = stored || "auto";
  function apply(mode) {
    var root = document.documentElement;
    if (mode === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    document.querySelectorAll(".segmented button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-mode") === mode));
    });
  }
  apply(mode);
  document.querySelectorAll(".segmented button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var m = btn.getAttribute("data-mode") || "auto";
      try { localStorage.setItem("rs-claude-cost-theme", m); } catch (e) {}
      apply(m);
    });
  });
})();
`;

function statTile(label: string, value: string, caption: string): string {
  return (
    `<div class="kpi-tile"><div class="value tabular">${escapeXml(value)}</div>` +
    `<div class="label">${escapeXml(label)}</div><div class="caption">${escapeXml(caption)}</div></div>`
  );
}

function miniTile(label: string, value: string): string {
  return `<div class="mini-tile"><div class="value tabular">${escapeXml(value)}</div><div class="label">${escapeXml(label)}</div></div>`;
}

function tableToggle(label: string, table: string): string {
  return `<details class="table-toggle"><summary>${escapeXml(label)}</summary>${table}</details>`;
}

function topFindingCallout(report: Report): string {
  const top = report.findings[0];
  if (!top) {
    return `<div class="top-finding"><div class="kicker">Top finding</div><div class="title">None above threshold</div></div>`;
  }
  return (
    `<div class="top-finding"><div class="kicker">Top finding</div>` +
    `<div class="title">${escapeXml(top.title)}</div>` +
    `<div class="dollars tabular">${usd(top.dollars)} <span class="chip">${top.confidence.replace("_", " ")}</span></div>` +
    `<div class="action">${escapeXml(top.action)}</div></div>`
  );
}

// -- Where it went: 24px stacked HTML bar, direct labels, legend below in the same order --

function whereItWentChart(report: Report): string {
  const rows = TOKEN_KIND_ORDER.map((kind) => ({ kind, row: report.by_kind[kind] })).filter((r) => r.row.dollars > 0);
  const sorted = [...rows].sort((a, b) => b.row.dollars - a.row.dollars);
  const total = sorted.reduce((a, r) => a + r.row.dollars, 0);
  // Kinds under 0.5% share get no bar segment of their own - a sliver isn't
  // worth rendering - but they still show up in the legend below.
  const segs = sorted
    .filter(({ row }) => row.share >= 0.005)
    .map(({ kind, row }) => {
      const widthPct = total === 0 ? 0 : (row.dollars / total) * 100;
      const label = `${TOKEN_KIND_LABEL[kind]} · ${usd(row.dollars)}`;
      // A direct label only fits once the segment is wide enough for its own text; otherwise it's legend + tooltip only.
      const showLabel = widthPct >= 14;
      return (
        `<div class="stack-seg hit" style="width:${widthPct.toFixed(2)}%;background:${TOKEN_KIND_VAR[kind]}" ` +
        `data-tip="${escapeXml(`${TOKEN_KIND_LABEL[kind]}: ${usd(row.dollars)} (${Math.round(row.share * 100)}%)`)}" tabindex="0">` +
        (showLabel ? `<span class="seg-label">${escapeXml(label)}</span>` : "") +
        `<title>${escapeXml(TOKEN_KIND_LABEL[kind])}: ${usd(row.dollars)} (${Math.round(row.share * 100)}%)</title></div>`
      );
    })
    .join("");
  const legendItems = sorted.map(({ kind, row }) => ({
    color: TOKEN_KIND_VAR[kind],
    label: TOKEN_KIND_LABEL[kind],
    value: `${usd(row.dollars)} · ${Math.round(row.share * 100)}%`,
  }));
  return `<div class="stack-bar" role="img" aria-label="Where the money went, by token kind">${segs}</div>${legend(legendItems)}`;
}

function whereItWentTable(report: Report): string {
  const rows = TOKEN_KIND_ORDER.map((kind) => {
    const row = report.by_kind[kind];
    return `<tr><td>${escapeXml(TOKEN_KIND_LABEL[kind])}</td><td class="num">${usd(row.dollars)}</td><td class="num">${Math.round(row.share * 100)}%</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Kind</th><th class="num">Dollars</th><th class="num">Share</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// -- Context and cache: mini-tiles + HTML histogram --

function contextHistogramChart(report: Report): string {
  const bins = report.context.bins;
  const max = Math.max(1, ...bins.map((b) => b.dollars));
  const cols = bins
    .map((bin) => {
      const heightPct = (bin.dollars / max) * 100;
      const heavy = bin.label === "150k_to_300k" || bin.label === "over_300k";
      return (
        `<div class="hist-col">` +
        `<div class="hist-value">${usd(bin.dollars)}</div>` +
        `<div class="hist-bar hit${heavy ? " heavy" : ""}" style="height:${heightPct.toFixed(1)}%" ` +
        `data-tip="${escapeXml(`${bin.label.replace(/_/g, " ")}: ${usd(bin.dollars)}, ${bin.turns} turns`)}" tabindex="0">` +
        `<title>${bin.label}: ${usd(bin.dollars)}, ${bin.turns} turns</title></div>` +
        `<div class="hist-label">${escapeXml(bin.label.replace(/_/g, " "))}</div>` +
        `</div>`
      );
    })
    .join("");
  const heavyDollars = bins
    .filter((b) => b.label === "150k_to_300k" || b.label === "over_300k")
    .reduce((a, b) => a + b.dollars, 0);
  const heavyShare = report.totals.dollars === 0 ? 0 : heavyDollars / report.totals.dollars;
  return (
    `<div class="histogram">${cols}</div>` +
    `<div class="hist-annotation">${pct(heavyShare)} of spend above ${Math.round(HEAVY_CONTEXT_TOKENS / 1000)}K</div>`
  );
}

function contextHistogramTable(report: Report): string {
  const rows = report.context.bins
    .map((b) => `<tr><td>${b.label}</td><td class="num">${b.turns}</td><td class="num">${usd(b.dollars)}</td></tr>`)
    .join("");
  return `<table><thead><tr><th>Bin</th><th class="num">Turns</th><th class="num">Dollars</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// -- Models: horizontal HTML bars, 20px rows --

function modelsBarChart(report: Report): string {
  const models = report.by_model.slice(0, 8);
  const max = Math.max(1, ...models.map((m) => m.dollars));
  return models
    .map((m) => {
      const widthPct = (m.dollars / max) * 100;
      return (
        `<div class="hbar-row hit" data-tip="${escapeXml(`${m.label}: ${usd(m.dollars)} (${Math.round(m.share * 100)}%)`)}" tabindex="0">` +
        `<div class="hbar-label">${escapeXml(m.label)}</div>` +
        `<div class="hbar-track"><div class="hbar-fill" style="width:${widthPct.toFixed(1)}%"></div></div>` +
        `<div class="hbar-value tabular">${usd(m.dollars)}</div>` +
        `<div class="hbar-share tabular">${Math.round(m.share * 100)}%</div>` +
        `<title>${escapeXml(m.label)}: ${usd(m.dollars)} (${Math.round(m.share * 100)}%)</title></div>`
      );
    })
    .join("");
}

function modelsTable(report: Report): string {
  const rows = report.by_model
    .map(
      (m) =>
        `<tr><td>${escapeXml(m.label)}</td><td class="num">${usd(m.dollars)}</td><td class="num">${Math.round(m.share * 100)}%</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Model</th><th class="num">Dollars</th><th class="num">Share</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// -- Findings: rank, title/action, dollars bar (hatched when estimated), dollars, confidence, session count --

function findingsList(report: Report): string {
  const findings = report.findings;
  const max = Math.max(1, ...findings.map((f) => f.dollars));
  return findings
    .map((f, i) => {
      const widthPct = (f.dollars / max) * 100;
      const conf = f.confidence.replace("_", " ");
      const hatchClass = f.confidence === "estimated" ? " hatch" : "";
      return (
        `<div class="finding-row">` +
        `<div class="finding-rank">${i + 1}</div>` +
        `<div class="finding-main"><div class="finding-title">${escapeXml(f.title)}</div>` +
        `<div class="finding-action">${escapeXml(f.action)}</div></div>` +
        `<div class="finding-track hit" data-tip="${escapeXml(`${usd(f.dollars)} (${conf})`)}" tabindex="0">` +
        `<div class="finding-bar${hatchClass}" style="width:${widthPct.toFixed(1)}%"></div>` +
        `<title>${usd(f.dollars)} (${conf})</title></div>` +
        `<div class="finding-value">${usd(f.dollars)}</div>` +
        `<div class="chip">${escapeXml(conf)}</div>` +
        `<div class="finding-sessions">${f.sessionIds.length} sess.</div>` +
        `</div>`
      );
    })
    .join("");
}

function findingsTable(report: Report): string {
  const rows = report.findings
    .map(
      (f) =>
        `<tr><td>${f.rule}</td><td>${escapeXml(f.title)}</td><td class="num">${usd(f.dollars)}</td><td>${f.confidence}</td>` +
        `<td>${escapeXml(f.action)}</td><td>${escapeXml(f.resumeCommand)}</td></tr>`,
    )
    .join("");
  return (
    `<table><thead><tr><th>Rule</th><th>Title</th><th class="num">Dollars</th><th>Confidence</th><th>Action</th><th>Resume</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`
  );
}

function findingsSection(report: Report): string {
  if (report.findings.length === 0) {
    return `<div class="card"><p>None above threshold this week.</p></div>`;
  }
  return `<div class="card">${findingsList(report)}${tableToggle("show table", findingsTable(report))}</div>`;
}

// -- What-if: table sorted by total, display names, signed delta + %, tiny inline bar --

function whatifSection(report: Report, caveat: string): string {
  const rows = report.whatif.slice(0, MAX_WHATIF_MODELS);
  const max = Math.max(report.totals.dollars, ...rows.map((r) => r.totalDollars), 1);
  const actualRow =
    `<tr><td>actual</td><td class="num">${usd(report.totals.dollars)}</td>` +
    `<td class="num"><span class="whatif-bar" style="width:${((report.totals.dollars / max) * 60).toFixed(1)}px"></span></td>` +
    `<td class="num">—</td></tr>`;
  const modelRows = rows
    .map((w) => {
      const deltaClass = w.deltaDollars > 0 ? "delta-up" : w.deltaDollars < 0 ? "delta-down" : "";
      const sign = w.deltaDollars > 0 ? "+" : "";
      const pctDelta = report.totals.dollars === 0 ? 0 : (w.deltaDollars / report.totals.dollars) * 100;
      return (
        `<tr><td>${escapeXml(w.label)}</td><td class="num">${usd(w.totalDollars)}` +
        `<span class="whatif-bar" style="width:${((w.totalDollars / max) * 60).toFixed(1)}px"></span></td>` +
        `<td></td><td class="num ${deltaClass}">${sign}${usd(w.deltaDollars)} (${sign}${Math.round(pctDelta)}%)</td></tr>`
      );
    })
    .join("");
  return (
    `<div class="card"><table><thead><tr><th>Model</th><th class="num">Total</th><th></th><th class="num">Delta vs actual</th></tr></thead>` +
    `<tbody>${actualRow}${modelRows}</tbody></table>` +
    `<p class="caption" style="color:var(--text-secondary);font-size:12px;margin-top:8px">${escapeXml(caveat)}</p></div>`
  );
}

// -- Sessions: small multiples, 2 columns, header + line chart + resume command --

function sessionDateLabel(session: Session, tz: string): string {
  return new Date(session.firstTimestampMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: tz === "UTC" ? "UTC" : undefined,
  });
}

function sessionsSection(report: Report): string {
  const top = [...report.sessions]
    .sort((a, b) => (b.mainDollars ?? 0) + (b.subagentDollars ?? 0) - ((a.mainDollars ?? 0) + (a.subagentDollars ?? 0)))
    .slice(0, MAX_SESSIONS_SHOWN);
  const causesPresent = new Set(top.flatMap((s) => s.cacheBreaks.map((b) => b.cause)));
  const cards = top
    .map((s, i) => {
      const dollars = (s.mainDollars ?? 0) + (s.subagentDollars ?? 0);
      return (
        `<div class="card session-card"><div class="session-header">` +
        `<strong>${escapeXml(s.project)}</strong> · ${sessionDateLabel(s, report.window.tz)} · ${s.spanHours.toFixed(
          1,
        )}h span · <span class="tabular">${usd(dollars)}</span> · ${s.turns} turns</div>` +
        sessionContextLine(s, i) +
        copyButton(s.resumeCommand) +
        `</div>`
      );
    })
    .join("");
  const causeLegend =
    causesPresent.size > 0
      ? legend([...causesPresent].map((c) => ({ color: CAUSE_VAR[c], label: CAUSE_LABEL[c] })))
      : "";
  return (
    `<p class="caption" style="color:var(--text-secondary);font-size:13px;margin:0 0 8px">` +
    `Context size per turn for the top ${top.length} sessions. Dots mark cache breaks; vertical lines mark compactions; ` +
    `the dashed line marks 150K.</p>${causeLegend}<div class="session-grid">${cards}</div>`
  );
}

function dataQualitySection(report: Report): string {
  const dq = report.data_quality;
  const hasIssues = dq.filesFailed.length > 0 || dq.reconciliation !== "pass" || Object.keys(dq.unknownModels).length > 0;
  const chipClass = hasIssues ? "chip-warn" : "chip-pass";
  const chipText = hasIssues ? "warnings" : "pass";
  return (
    `<details class="table-toggle"><summary>Data quality <span class="chip ${chipClass}">${chipText}</span></summary>` +
    `<table><tbody>` +
    `<tr><td>Files read</td><td class="num">${dq.filesRead}</td></tr>` +
    `<tr><td>Files failed</td><td class="num">${dq.filesFailed.length}</td></tr>` +
    `<tr><td>Duplicate lines dropped</td><td class="num">${dq.duplicateLinesDropped}</td></tr>` +
    `<tr><td>Reconciliation</td><td class="num">${dq.reconciliation}</td></tr>` +
    `<tr><td>Claude Code versions</td><td>${escapeXml(dq.claudeCodeVersions.join(", ") || "unknown")}</td></tr>` +
    `</tbody></table></details>`
  );
}

function topBar(report: Report): string {
  return (
    `<div class="topbar">` +
    `<h1>rs-claude-cost</h1>` +
    `<div class="meta"><span>${escapeXml(report.window.isoWeek)}</span><span>${escapeXml(
      windowLabel(report.window),
    )}</span><span class="chip">list prices · local only</span></div>` +
    `<nav><a href="#where">Where</a><a href="#context">Context</a><a href="#models">Models</a><a href="#sessions">Sessions</a>` +
    `<a href="#findings">Findings</a><a href="#whatif">What-if</a></nav>` +
    `<div class="spacer"></div>` +
    `<div class="segmented" role="group" aria-label="Theme">` +
    `<button type="button" data-mode="auto" aria-pressed="true">Auto</button>` +
    `<button type="button" data-mode="light" aria-pressed="false">Light</button>` +
    `<button type="button" data-mode="dark" aria-pressed="false">Dark</button>` +
    `</div></div>`
  );
}

export interface RenderHtmlOptions {
  caveat: string;
  rebuildCommand: string;
  exitCode: 0 | 1 | 2;
}

export function renderHtml(report: Report, options: RenderHtmlOptions): string {
  const totalTurns = report.context.bins.reduce((a, b) => a + b.turns, 0);
  const warningBanner =
    options.exitCode === 2
      ? `<div class="warning-banner">Warning: this report has data-quality issues (unknown model, stale prices, or unreadable files). See Data quality below.</div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rs-claude-cost - ${escapeXml(report.window.isoWeek)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="viz-root">
${topBar(report)}
<div class="page">
${warningBanner}
<div class="headline-row">
  <div class="kpi-row">
    ${statTile("Total", usd(report.totals.dollars), "list price, not spend")}
    ${statTile("Sessions", String(report.totals.sessions), "resumed sessions count once")}
    ${statTile("Turns", String(totalTurns), "one assistant reply each")}
    ${statTile("Active days", String(report.window.activeDays), `of 7 this week`)}
  </div>
  ${topFindingCallout(report)}
</div>

<section id="where">
  <h2 class="section-title">Where it went</h2>
  <div class="card">${whereItWentChart(report)}${tableToggle("show table", whereItWentTable(report))}</div>
</section>

<section id="context">
  <h2 class="section-title">Context and cache</h2>
  <div class="card">
    <div class="mini-tiles">
      ${miniTile("Cache hit rate", `${Math.round(report.cache.hitRate * 100)}%`)}
      ${miniTile("Median context", `${Math.round(report.context.median / 1000)}K`)}
      ${miniTile("p90 context", `${Math.round(report.context.p90 / 1000)}K`)}
      ${miniTile("Share above 150K", pct(
        report.totals.dollars === 0
          ? 0
          : report.context.bins
              .filter((b) => b.label === "150k_to_300k" || b.label === "over_300k")
              .reduce((a, b) => a + b.dollars, 0) / report.totals.dollars,
      ))}
    </div>
    ${contextHistogramChart(report)}${tableToggle("show table", contextHistogramTable(report))}
    <div class="mini-tiles" style="margin-top:12px">
      ${miniTile("1h premium paid", usd(report.cache.payoff.premiumPaid))}
      ${miniTile("Rewrites avoided", usd(report.cache.payoff.rewritesAvoided))}
      ${miniTile(report.cache.payoff.netDollars <= 0 ? "Net saved" : "Net paid", usd(Math.abs(report.cache.payoff.netDollars)))}
    </div>
  </div>
</section>

<section id="models">
  <h2 class="section-title">Models</h2>
  <div class="card">${modelsBarChart(report)}${tableToggle("show table", modelsTable(report))}</div>
</section>

<section id="sessions">
  <h2 class="section-title">Sessions</h2>
  ${sessionsSection(report)}
</section>

<section id="findings">
  <h2 class="section-title">Findings</h2>
  ${findingsSection(report)}
</section>

<section id="whatif">
  <h2 class="section-title">What-if</h2>
  ${whatifSection(report, options.caveat)}
</section>

<section id="since">
  <h2 class="section-title">Since last week</h2>
  ${sinceLastWeekSection(report)}
</section>

<section id="quality">
  ${dataQualitySection(report)}
</section>

<footer>
  List prices, local data, not shared. Pricing as of ${escapeXml(report.pricing.as_of)}.
  Rebuild with <code>${escapeXml(options.rebuildCommand)}</code>.
</footer>
</div>
</div>
<div id="tooltip"></div>
<script>${THEME_SCRIPT}</script>
<script>${TOOLTIP_SCRIPT}</script>
</body>
</html>
`;
}

function sinceLastWeekSection(report: Report): string {
  if (report.since_last_week.length === 0) {
    return `<div class="card"><p>No previous week recorded.</p></div>`;
  }
  const rows = report.since_last_week
    .map((r) => {
      const arrow = r.direction === "up" ? "▲" : r.direction === "down" ? "▼" : "→";
      return `<tr><td>${r.rule}</td><td>${escapeXml(r.title)}</td><td class="num">${usd(r.metricThen)}</td><td class="num">${usd(
        r.metricNow,
      )}</td><td>${arrow}</td></tr>`;
    })
    .join("");
  return (
    `<div class="card"><table><thead><tr><th>Rule</th><th>Title</th><th class="num">Then</th><th class="num">Now</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
  );
}
