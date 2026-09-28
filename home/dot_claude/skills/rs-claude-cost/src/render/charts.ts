// Shared building blocks for the HTML page: token-kind and cache-break-cause
// color roles, the legend, the session line chart (the one true SVG chart -
// everything else is plain HTML/CSS so no viewBox ever scales its text), and
// the tooltip/copy scripts. Every value still carries a <title> fallback.

import type { CacheBreakCause, Session, TokenKind } from "../types.ts";

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

export const HEAVY_CONTEXT_TOKENS = 150_000;

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

export function usd(microDollars: number): string {
  const dollars = microDollars / 1_000_000;
  const sign = dollars < 0 ? "−" : "";
  return `${sign}$${Math.abs(dollars).toFixed(2)}`;
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

export function copyButton(command: string): string {
  const escaped = escapeXml(command);
  return (
    `<div class="resume-row"><code class="resume-cmd">${escaped}</code>` +
    `<button type="button" class="copy-btn" data-copy="${escaped}">Copy</button></div>`
  );
}

const SESSION_CHART_WIDTH = 460;
const SESSION_CHART_HEIGHT = 140;

/**
 * The one true SVG chart: context size over turns for a single session.
 * Fixed viewBox sized to this chart's own column width, so the browser's
 * default uniform scale (never preserveAspectRatio="none") keeps text from
 * stretching. Compaction ticks, cause-colored break dots, and a dashed 150K
 * reference line ride the same axes.
 */
export function sessionContextLine(session: Session, index: number): string {
  const width = SESSION_CHART_WIDTH;
  const height = SESSION_CHART_HEIGHT;
  const padL = 32;
  const padR = 10;
  const padT = 18;
  const padB = 10;
  const turns = session.contextSeries;
  const max = Math.max(1, ...turns.map((t) => t.promptSize));
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const stepX = turns.length > 1 ? innerW / (turns.length - 1) : 0;
  const yOf = (tokens: number) => padT + innerH - (tokens / max) * innerH;
  const xOf = (i: number) => padL + i * stepX;

  const points = turns.map((t, i) => `${xOf(i).toFixed(1)},${yOf(t.promptSize).toFixed(1)}`);
  const path = `<polyline points="${points.join(" ")}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;

  const zeroTick = `<text x="2" y="${(padT + innerH + 3).toFixed(1)}" class="axis-label">0</text>`;
  const peakTick = `<text x="2" y="${(padT + 3).toFixed(1)}" class="axis-label">${Math.round(max / 1000)}K</text>`;
  const reference =
    max > HEAVY_CONTEXT_TOKENS
      ? `<line x1="${padL}" y1="${yOf(HEAVY_CONTEXT_TOKENS).toFixed(1)}" x2="${width - padR}" y2="${yOf(
          HEAVY_CONTEXT_TOKENS,
        ).toFixed(1)}" stroke="var(--baseline)" stroke-width="1" stroke-dasharray="4 3"/>`
      : "";

  const compactionTicks = turns
    .map((t, i) => (t.compactedSincePrevious ? i : -1))
    .filter((i) => i >= 0)
    .map((i) => {
      const x = xOf(i);
      return `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + innerH}" stroke="var(--baseline)" stroke-width="1"><title>compaction at turn ${i + 1}</title></line>`;
    });

  const breakDots = session.cacheBreaks.map((b) => {
    const i = Math.min(turns.length - 1, b.turnIndex);
    const x = xOf(i);
    const y = yOf(turns[i]?.promptSize ?? 0);
    return (
      `<circle class="hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${CAUSE_VAR[b.cause]}" ` +
      `stroke="var(--surface-1)" stroke-width="2" data-tip="${escapeXml(`${CAUSE_LABEL[b.cause]} at turn ${i + 1}`)}">` +
      `<title>${escapeXml(CAUSE_LABEL[b.cause])} at turn ${i + 1}</title></circle>`
    );
  });

  return (
    `<svg class="chart session-chart" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `role="img" aria-label="Context size over turns for ${escapeXml(session.project)}, session ${index + 1}">` +
    `${reference}${path}${compactionTicks.join("")}${breakDots.join("")}${zeroTick}${peakTick}</svg>`
  );
}
