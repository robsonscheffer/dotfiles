// The HTML page: one self-contained file, inline CSS and SVG, no external
// URLs. Renders the one report object only (D2) - every chart and table
// below reads from `report`, none recomputes.

import type { CacheBreakCause, Report } from "../types.ts";
import { windowLabel } from "../date.ts";
import {
  CAUSE_LABEL,
  CAUSE_VAR,
  contextHistogram,
  contextHistogramTable,
  escapeXml,
  findingsBarChart,
  findingsTable,
  legend,
  modelsBarChart,
  modelsTable,
  sessionContextLine,
  stackedBarChart,
  stackedBarTable,
} from "./charts.ts";

function usd(microDollars: number): string {
  const dollars = microDollars / 1_000_000;
  const sign = dollars < 0 ? "-" : "";
  return `${sign}$${Math.abs(dollars).toFixed(2)}`;
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
body {
  margin: 0;
  background: var(--page-plane);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
.page { max-width: 900px; margin: 0 auto; padding: 24px; }
h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
h2 { font-size: 15px; font-weight: 600; margin: 28px 0 10px; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin-bottom: 20px; }
.card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.stat-row { display: flex; gap: 24px; flex-wrap: wrap; }
.stat-tile .label { font-size: 12px; color: var(--text-secondary); }
.stat-tile .value { font-size: 24px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--gridline); }
th { color: var(--text-secondary); font-weight: 500; }
.axis-label { font-size: 11px; fill: var(--text-secondary); font-family: system-ui, sans-serif; }
.chip {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
details.table-toggle summary { cursor: pointer; color: var(--text-secondary); font-size: 12px; margin-top: 8px; }
.chart { display: block; width: 100%; height: auto; }
.session-chart { margin-bottom: 8px; }
.warning-banner {
  background: var(--status-warning);
  color: #0b0b0b;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 16px;
}
.theme-toggle {
  float: right;
  font-size: 12px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
footer { color: var(--text-muted); font-size: 12px; margin-top: 32px; }
code { background: var(--gridline); padding: 1px 4px; border-radius: 3px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; margin: 8px 0; color: var(--text-secondary); }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.legend-value { color: var(--text-primary); }
.swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.finding-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) 170px; gap: 12px; align-items: center; padding: 5px 0; font-size: 13px; }
.finding-track { height: 14px; }
.finding-bar { height: 100%; min-width: 2px; border-radius: 0 4px 4px 0; background: var(--series-4); }
.finding-estimated { background: repeating-linear-gradient(45deg, var(--series-4) 0 3px, transparent 3px 6px); border: 1px solid var(--series-4); }
.finding-value { white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

function statTile(label: string, value: string): string {
  return `<div class="stat-tile"><div class="label">${escapeXml(label)}</div><div class="value">${escapeXml(value)}</div></div>`;
}

function tableToggle(label: string, table: string): string {
  return `<details class="table-toggle"><summary>${escapeXml(label)}</summary>${table}</details>`;
}

function findingsSection(report: Report): string {
  if (report.findings.length === 0) {
    return `<div class="card"><h2>Findings</h2><p>None above threshold this week.</p></div>`;
  }
  return `<div class="card"><h2>Findings</h2>${findingsBarChart(report)}${tableToggle("show table", findingsTable(report))}</div>`;
}

function whatifSection(report: Report, caveat: string): string {
  const rows = report.whatif
    .map(
      (w) =>
        `<tr><td>${escapeXml(w.model)}</td><td>${usd(w.totalDollars)}</td><td>${usd(w.mainDollars)}</td><td>${usd(
          w.subagentDollars,
        )}</td><td>${usd(w.deltaDollars)}</td></tr>`,
    )
    .join("");
  return (
    `<div class="card"><h2>What-if</h2>` +
    `<table><thead><tr><th>Model</th><th>Total</th><th>Main</th><th>Subagents</th><th>Delta vs actual</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>` +
    `<p class="subtitle">${escapeXml(caveat)}</p></div>`
  );
}

function sinceLastWeekSection(report: Report): string {
  if (report.since_last_week.length === 0) {
    return `<div class="card"><h2>Since last week</h2><p>No previous week recorded.</p></div>`;
  }
  const rows = report.since_last_week
    .map((r) => {
      const arrow = r.direction === "up" ? "▲" : r.direction === "down" ? "▼" : "→";
      return `<tr><td>${r.rule}</td><td>${escapeXml(r.title)}</td><td>${usd(r.metricThen)}</td><td>${usd(
        r.metricNow,
      )}</td><td>${arrow}</td></tr>`;
    })
    .join("");
  return (
    `<div class="card"><h2>Since last week</h2>` +
    `<table><thead><tr><th>Rule</th><th>Title</th><th>Then</th><th>Now</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

function sessionsSection(report: Report): string {
  const top = [...report.sessions]
    .sort((a, b) => (b.mainDollars ?? 0) + (b.subagentDollars ?? 0) - ((a.mainDollars ?? 0) + (a.subagentDollars ?? 0)))
    .slice(0, 5);
  const charts = top
    .map((s) => {
      const dollars = (s.mainDollars ?? 0) + (s.subagentDollars ?? 0);
      return (
        `<div class="card"><h2>${escapeXml(s.project)} · ${usd(dollars)} · ${s.turns} turns</h2>` +
        sessionContextLine(s, s.contextSeries, s.cacheBreaks) +
        `<p class="subtitle"><code>${escapeXml(s.resumeCommand)}</code></p></div>`
      );
    })
    .join("");
  const markers = legend(
    (Object.keys(CAUSE_LABEL) as CacheBreakCause[]).map((c) => ({ color: CAUSE_VAR[c], label: CAUSE_LABEL[c] })),
  );
  return `<h2>Sessions</h2><p class="subtitle">Context size per turn for the top sessions. Dots mark cache breaks; vertical lines mark compactions.</p>${markers}${charts}`;
}

function dataQualitySection(report: Report): string {
  const dq = report.data_quality;
  return (
    `<div class="card"><h2>Data quality</h2><table><tbody>` +
    `<tr><td>Files read</td><td>${dq.filesRead}</td></tr>` +
    `<tr><td>Files failed</td><td>${dq.filesFailed.length}</td></tr>` +
    `<tr><td>Duplicate lines dropped</td><td>${dq.duplicateLinesDropped}</td></tr>` +
    `<tr><td>Reconciliation</td><td>${dq.reconciliation}</td></tr>` +
    `<tr><td>Claude Code versions</td><td>${escapeXml(dq.claudeCodeVersions.join(", ") || "unknown")}</td></tr>` +
    `</tbody></table></div>`
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
<div class="viz-root page">
<button class="theme-toggle" onclick="var r=document.documentElement,t=r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');r.setAttribute('data-theme',t==='dark'?'light':'dark')">Toggle theme</button>
<h1>rs-claude-cost &middot; ${escapeXml(report.window.isoWeek)}</h1>
<div class="subtitle">${escapeXml(windowLabel(report.window))} &middot; ${escapeXml(
    report.window.tz,
  )} time &middot; list prices, local data, not shared</div>
${warningBanner}
<div class="card">
  <div class="stat-row">
    ${statTile("Total", usd(report.totals.dollars))}
    ${statTile("Sessions", String(report.totals.sessions))}
    ${statTile("Turns", String(totalTurns))}
    ${statTile("Active days", String(report.window.activeDays))}
  </div>
</div>

<h2>Where it went</h2>
<div class="card">${stackedBarChart(report)}${tableToggle("show table", stackedBarTable(report))}</div>

<h2>Context and cache</h2>
<div class="card">
  <div class="stat-row">
    ${statTile("Cache hit rate", `${Math.round(report.cache.hitRate * 100)}%`)}
    ${statTile("Median context", `${Math.round(report.context.median / 1000)}K`)}
    ${statTile("p90 context", `${Math.round(report.context.p90 / 1000)}K`)}
  </div>
  ${contextHistogram(report)}${tableToggle("show table", contextHistogramTable(report))}
  <p class="subtitle">1h cache: paid ${usd(report.cache.payoff.premiumPaid)} premium, avoided ${usd(
    report.cache.payoff.rewritesAvoided,
  )} rewrites, net ${report.cache.payoff.netDollars <= 0 ? "saved" : "paid"} ${usd(
    Math.abs(report.cache.payoff.netDollars),
  )}.</p>
</div>

<h2>Models</h2>
<div class="card">${modelsBarChart(report)}${tableToggle("show table", modelsTable(report))}</div>

${sessionsSection(report)}

${findingsSection(report)}

${whatifSection(report, options.caveat)}

${sinceLastWeekSection(report)}

${dataQualitySection(report)}

<footer>
  List prices, local data, not shared. Pricing as of ${escapeXml(report.pricing.as_of)}.
  Rebuild with <code>${escapeXml(options.rebuildCommand)}</code>.
</footer>
</div>
</body>
</html>
`;
}
