// Inline SVG chart builders. Every value uses <title> for native hover
// tooltips (no external URL, no script needed for hover), and every chart
// has a plain-HTML table twin the caller renders alongside it.

import type { CacheBreakCause, Report, TokenKind } from "../types.ts";

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const TOKEN_KIND_ORDER: TokenKind[] = ["input", "cache_read", "cache_write_5m", "cache_write_1h", "output"];

export const TOKEN_KIND_VAR: Record<TokenKind, string> = {
  input: "var(--series-1)",
  cache_read: "var(--series-2)",
  cache_write_5m: "var(--series-3)",
  cache_write_1h: "var(--series-4)",
  output: "var(--series-5)",
};

export const TOKEN_KIND_LABEL: Record<TokenKind, string> = {
  input: "fresh input",
  cache_read: "re-reading context",
  cache_write_5m: "storing context 5m",
  cache_write_1h: "storing context 1h",
  output: "Claude writing",
};

const HEAVY_CONTEXT_TOKENS = 150_000;

export const CAUSE_LABEL: Record<CacheBreakCause, string> = {
  compaction: "compaction",
  model_switch: "likely model switch",
  idle_expiry: "likely idle expiry",
  unknown: "unknown cause",
};

export const CAUSE_VAR: Record<CacheBreakCause, string> = {
  compaction: "var(--status-good)",
  model_switch: "var(--status-warning)",
  idle_expiry: "var(--status-serious)",
  unknown: "var(--status-critical)",
};

function usd(microDollars: number): string {
  const dollars = microDollars / 1_000_000;
  return `$${dollars.toFixed(2)}`;
}

/** A legend row: swatch, label, value. Identity never rests on color alone. */
export function legend(items: { color: string; label: string; value?: string }[]): string {
  return (
    `<div class="legend">` +
    items
      .map(
        (it) =>
          `<span class="legend-item"><span class="swatch" style="background:${it.color}"></span>${escapeXml(it.label)}` +
          (it.value ? ` <span class="legend-value">${escapeXml(it.value)}</span>` : "") +
          `</span>`,
      )
      .join("") +
    `</div>`
  );
}

/** One horizontal stacked bar, by token kind, for "where it went". */
export function stackedBarChart(report: Report): string {
  const width = 640;
  const height = 60;
  const total = TOKEN_KIND_ORDER.reduce((a, k) => a + report.by_kind[k].dollars, 0);
  let x = 0;
  const gap = 2;
  const bars: string[] = [];
  for (const kind of TOKEN_KIND_ORDER) {
    const row = report.by_kind[kind];
    if (row.dollars <= 0) continue;
    const w = total === 0 ? 0 : (row.dollars / total) * width;
    const segW = Math.max(0, w - gap);
    bars.push(
      `<rect x="${x.toFixed(1)}" y="0" width="${segW.toFixed(1)}" height="${height}" fill="${TOKEN_KIND_VAR[kind]}" rx="4">` +
        `<title>${escapeXml(TOKEN_KIND_LABEL[kind])}: ${usd(row.dollars)} (${Math.round(row.share * 100)}%)</title></rect>`,
    );
    x += w;
  }
  const items = TOKEN_KIND_ORDER.filter((k) => report.by_kind[k].dollars > 0).map((k) => ({
    color: TOKEN_KIND_VAR[k],
    label: TOKEN_KIND_LABEL[k],
    value: `${usd(report.by_kind[k].dollars)} · ${Math.round(report.by_kind[k].share * 100)}%`,
  }));
  return (
    `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Where the money went, by token kind">${bars.join("")}</svg>` +
    legend(items)
  );
}

export function stackedBarTable(report: Report): string {
  const rows = TOKEN_KIND_ORDER.map((kind) => {
    const row = report.by_kind[kind];
    return `<tr><td>${escapeXml(TOKEN_KIND_LABEL[kind])}</td><td>${usd(row.dollars)}</td><td>${Math.round(row.share * 100)}%</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Kind</th><th>Dollars</th><th>Share</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** A histogram of cost by context-size bin. */
export function contextHistogram(report: Report): string {
  const width = 640;
  const height = 160;
  const barGap = 16;
  const barWidth = (width - barGap * (report.context.bins.length - 1)) / report.context.bins.length;
  const max = Math.max(1, ...report.context.bins.map((b) => b.dollars));
  const bars = report.context.bins.map((bin, i) => {
    const h = (bin.dollars / max) * (height - 40);
    const x = i * (barWidth + barGap);
    const y = height - 20 - h;
    return (
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--series-2)" rx="4">` +
        `<title>${bin.label}: ${usd(bin.dollars)}, ${bin.turns} turns</title></rect>` +
      `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" class="axis-label">${usd(bin.dollars)}</text>` +
      `<text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 4}" text-anchor="middle" class="axis-label">${bin.label.replace(/_/g, " ")}</text>`
    );
  });
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cost by context size">${bars.join("")}</svg>`;
}

export function contextHistogramTable(report: Report): string {
  const rows = report.context.bins
    .map((b) => `<tr><td>${b.label}</td><td>${b.turns}</td><td>${usd(b.dollars)}</td></tr>`)
    .join("");
  return `<table><thead><tr><th>Bin</th><th>Turns</th><th>Dollars</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** One horizontal bar per model. */
export function modelsBarChart(report: Report): string {
  const width = 640;
  const rowHeight = 28;
  const models = report.by_model.slice(0, 8);
  const max = Math.max(1, ...models.map((m) => m.dollars));
  const height = rowHeight * models.length;
  const bars = models.map((m, i) => {
    const y = i * rowHeight;
    const w = (m.dollars / max) * (width - 270);
    return (
      `<text x="0" y="${y + rowHeight / 2 + 4}" class="axis-label">${escapeXml(m.model)}</text>` +
      `<rect x="150" y="${y + 4}" width="${Math.max(1, w).toFixed(1)}" height="${rowHeight - 8}" fill="var(--series-1)" rx="4">` +
        `<title>${escapeXml(m.model)}: ${usd(m.dollars)} (${Math.round(m.share * 100)}%)</title></rect>` +
      `<text x="${(158 + w).toFixed(1)}" y="${y + rowHeight / 2 + 4}" class="axis-label">${usd(m.dollars)} · ${Math.round(
        m.share * 100,
      )}%</text>`
    );
  });
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Dollars by model">${bars.join("")}</svg>`;
}

export function modelsTable(report: Report): string {
  const rows = report.by_model
    .map((m) => `<tr><td>${escapeXml(m.model)}</td><td>${usd(m.dollars)}</td><td>${Math.round(m.share * 100)}%</td></tr>`)
    .join("");
  return `<table><thead><tr><th>Model</th><th>Dollars</th><th>Share</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** One row per finding: full title, a bar scaled to the largest, dollars and a labeled chip. Hatched when estimated. */
export function findingsBarChart(report: Report): string {
  const findings = report.findings.slice(0, 10);
  const max = Math.max(1, ...findings.map((f) => f.dollars));
  const rows = findings.map((f) => {
    const pct = ((f.dollars / max) * 100).toFixed(1);
    const conf = f.confidence.replace("_", " ");
    return (
      `<div class="finding-row" title="${escapeXml(`${f.title}: ${usd(f.dollars)} (${conf})`)}">` +
      `<div class="finding-title">${escapeXml(f.title)}</div>` +
      `<div class="finding-track"><div class="finding-bar finding-${f.confidence}" style="width:${pct}%"></div></div>` +
      `<div class="finding-value">${usd(f.dollars)} <span class="chip">${conf}</span></div>` +
      `</div>`
    );
  });
  return `<div class="findings" role="list" aria-label="Findings by dollars">${rows.join("")}</div>`;
}

export function findingsTable(report: Report): string {
  const rows = report.findings
    .map(
      (f) =>
        `<tr><td>${f.rule}</td><td>${escapeXml(f.title)}</td><td>${usd(f.dollars)}</td><td>${f.confidence}</td><td>${escapeXml(
          f.resumeCommand,
        )}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Rule</th><th>Title</th><th>Dollars</th><th>Confidence</th><th>Resume</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Per-session context-over-turns line, with compaction ticks and cache-break dots. */
export function sessionContextLine(
  session: { id: string; project: string },
  turns: { promptSize: number; compactedSincePrevious: boolean }[],
  breaks: { turnIndex: number; cause: CacheBreakCause }[],
): string {
  const width = 640;
  const height = 120;
  const pad = 10;
  const max = Math.max(1, ...turns.map((t) => t.promptSize));
  const stepX = turns.length > 1 ? (width - 2 * pad) / (turns.length - 1) : 0;
  const points = turns.map((t, i) => {
    const x = pad + i * stepX;
    const y = height - pad - (t.promptSize / max) * (height - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `<polyline points="${points.join(" ")}" fill="none" stroke="var(--series-1)" stroke-width="2"/>`;
  const yOf = (tokens: number) => height - pad - (tokens / max) * (height - 2 * pad);
  const reference =
    max > HEAVY_CONTEXT_TOKENS
      ? `<line x1="${pad}" y1="${yOf(HEAVY_CONTEXT_TOKENS).toFixed(1)}" x2="${width - pad}" y2="${yOf(HEAVY_CONTEXT_TOKENS).toFixed(
          1,
        )}" stroke="var(--baseline)" stroke-dasharray="4 4"/>` +
        `<text x="${pad}" y="${(yOf(HEAVY_CONTEXT_TOKENS) - 4).toFixed(1)}" class="axis-label">150K</text>`
      : "";
  const peakLabel = `<text x="${pad}" y="${pad + 2}" class="axis-label">peak ${Math.round(max / 1000)}K tokens</text>`;
  const compactionTicks = turns
    .map((t, i) => (t.compactedSincePrevious ? i : -1))
    .filter((i) => i >= 0)
    .map((i) => {
      const x = pad + i * stepX;
      return `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="var(--baseline)" stroke-width="1"><title>compaction at turn ${i + 1}</title></line>`;
    });
  const breakDots = breaks.map((b) => {
    const i = Math.min(turns.length - 1, b.turnIndex);
    const x = pad + i * stepX;
    const y = height - pad - (turns[i]!.promptSize / max) * (height - 2 * pad);
    return `<circle cx="${x}" cy="${y}" r="5" fill="${CAUSE_VAR[b.cause]}" stroke="var(--surface-1)" stroke-width="2"><title>${CAUSE_LABEL[b.cause]} at turn ${i + 1}</title></circle>`;
  });
  return (
    `<svg class="chart session-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Context size over turns for ${escapeXml(
      session.project,
    )}">` +
    `${reference}${peakLabel}${compactionTicks.join("")}${path}${breakDots.join("")}</svg>`
  );
}
