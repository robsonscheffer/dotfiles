// The terminal summary: the default output. At most 45 lines, never wider
// than the render width, colored on a TTY unless NO_COLOR is set (D1:
// renders the one report object; it never recomputes a number).

import type { CacheBreakCause, Report, TokenKind } from "../types.ts";
import { WHATIF_CAVEAT_SHORT } from "../whatif.ts";
import { windowLabel } from "../date.ts";

const MIN_WIDTH = 80;
const MAX_WIDTH = 100;
const MAX_LINES = 45;
const MAX_FINDINGS = 6;
const MAX_WHATIF_MODELS = 3;
const MAX_SINCE_ROWS = 4;

export type ColorMode = "none" | "256" | "truecolor";

export interface RenderCliOptions {
  color: boolean;
  hasPriorWeek: boolean;
  priorWeekTotalDollars?: number | null;
  /** min(process.stdout.columns ?? 100, 100), floored at 80. Callers compute this once. */
  width?: number;
  colorMode?: ColorMode;
  /** Path to the HTML page for this week, if one was written. Renders as the last line. */
  pagePath?: string;
}

// -- palette (same hues as the HTML light theme's --series-N tokens) --------

const SERIES_HEX = {
  input: "#2a78d6",
  cache_read: "#eb6834",
  cache_write_5m: "#1baf7a",
  cache_write_1h: "#eda100",
  output: "#e87ba4",
} as const satisfies Record<TokenKind, string>;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Nearest xterm-256 color (16-231 6x6x6 cube) for a hex color. */
function to256(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const toStep = (v: number) => Math.round((v / 255) * 5);
  const rs = toStep(r);
  const gs = toStep(g);
  const bs = toStep(b);
  return 16 + rs * 36 + gs * 6 + bs;
}

function seriesFg(mode: ColorMode, hex: string): string {
  if (mode === "truecolor") {
    const [r, g, b] = hexToRgb(hex);
    return `\x1b[38;2;${r};${g};${b}m`;
  }
  if (mode === "256") return `\x1b[38;5;${to256(hex)}m`;
  return "";
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
};

function paint(color: boolean, code: string, text: string): string {
  return color ? `${code}${text}${ANSI.reset}` : text;
}

function usd(microDollars: number): string {
  const dollars = microDollars / 1_000_000;
  const sign = dollars < 0 ? "−" : "";
  return `${sign}$${Math.abs(dollars).toFixed(2)}`;
}

function thousands(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

const KIND_LABELS: Record<TokenKind, string> = {
  cache_read: "re-reading context",
  cache_write_1h: "storing context 1h",
  cache_write_5m: "storing context 5m",
  output: "Claude writing",
  input: "fresh input",
};

const CAUSE_ORDER: { key: CacheBreakCause; label: string }[] = [
  { key: "idle_expiry", label: "idle" },
  { key: "compaction", label: "compaction" },
  { key: "model_switch", label: "model switch" },
  { key: "unknown", label: "unknown" },
];

/** A track of heavy-filled cells over a dim light-filled remainder, so rows never touch. */
function bar(share: number, maxShare: number, trackWidth: number): string {
  const scaled = maxShare <= 0 ? 0 : Math.max(0, Math.min(1, share / maxShare));
  const cells = scaled * trackWidth;
  const full = Math.floor(cells);
  const remainder = cells - full;
  const half = remainder >= 0.5 ? 1 : 0;
  const empty = Math.max(0, trackWidth - full - half);
  return "━".repeat(full) + (half ? "╸" : "") + "─".repeat(empty);
}

function padLine(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function truncate(text: string, width: number): string {
  if (text.length <= width) return text;
  if (width <= 1) return text.slice(0, width);
  return `${text.slice(0, width - 1)}…`;
}

export function renderCli(report: Report, options: RenderCliOptions): string {
  const color = options.color;
  const colorMode: ColorMode = options.colorMode ?? (color ? "256" : "none");
  const width = Math.max(MIN_WIDTH, Math.min(options.width ?? MAX_WIDTH, MAX_WIDTH));

  const bold = (text: string) => paint(color, ANSI.bold, text);
  const dim = (text: string) => paint(color, ANSI.dim, text);

  const sections: string[][] = [];

  // -- header --------------------------------------------------------------
  const tzLabel = report.window.tz === "UTC" ? "UTC" : "local";
  const left = `rs-claude-cost  ${report.window.isoWeek} · ${windowLabel(report.window)}`;
  const right = dim(`list prices · ${tzLabel} time`);
  const rightPlain = `list prices · ${tzLabel} time`;
  const gap = Math.max(1, width - left.length - rightPlain.length);
  sections.push([`${left}${" ".repeat(gap)}${right}`]);

  // -- headline --------------------------------------------------------------
  const headline: string[] = [];
  headline.push(
    ` ${bold(usd(report.totals.dollars))}     ${dim(
      `${thousands(report.totals.sessions)} sessions · ${thousands(report.totals.turns)} turns · ${thousands(
        report.window.activeDays,
      )} active days`,
    )}`,
  );
  let trend: string;
  if (!options.hasPriorWeek || options.priorWeekTotalDollars == null) {
    trend = "first week recorded";
  } else {
    const delta = report.totals.dollars - options.priorWeekTotalDollars;
    const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "→";
    trend = `${arrow} ${usd(Math.abs(delta))} vs last week`;
  }
  headline.push(` ${dim(trend)}`);
  sections.push(headline);

  // -- WHERE IT WENT ---------------------------------------------------------
  const where: string[] = [bold("WHERE IT WENT")];
  const kinds: TokenKind[] = ["cache_read", "cache_write_1h", "output", "cache_write_5m", "input"];
  const visibleKinds = kinds
    .map((kind) => ({ kind, row: report.by_kind[kind] }))
    .filter(({ row }) => row.share >= 0.005)
    .sort((a, b) => b.row.dollars - a.row.dollars);
  const maxKindShare = Math.max(0, ...visibleKinds.map(({ row }) => row.share));
  const trackWidth = Math.min(28, width - 46);
  for (const { kind, row } of visibleKinds) {
    const label = padLine(KIND_LABELS[kind], 20);
    const fg = seriesFg(colorMode, SERIES_HEX[kind]);
    const trackText = bar(row.share, maxKindShare, trackWidth);
    const track = color && fg ? `${fg}${trackText}${ANSI.reset}` : trackText;
    where.push(` ${label} ${track}   ${usd(row.dollars).padStart(7)}   ${dim(pct(row.share).padStart(3))}`);
  }
  sections.push(where);

  // -- CONTEXT AND CACHE -------------------------------------------------------
  const context: string[] = [bold("CONTEXT AND CACHE")];
  context.push(
    ` ${pct(report.cache.hitRate)} cache hit rate · median ${Math.round(
      report.context.median / 1000,
    )}K · p90 ${Math.round(report.context.p90 / 1000)}K`,
  );
  const heavyBins = report.context.bins.filter((b) => b.label === "150k_to_300k" || b.label === "over_300k");
  const heavyDollars = heavyBins.reduce((a, b) => a + b.dollars, 0);
  const heavyShare = report.totals.dollars === 0 ? 0 : heavyDollars / report.totals.dollars;
  context.push(` ${pct(heavyShare)} of spend was in turns above 150K`);
  const causeParts = CAUSE_ORDER.map(({ key, label }) => ({ label, count: report.cache.breaksByCause[key] })).filter(
    (c) => c.count > 0,
  );
  const causeText = causeParts.length > 0 ? causeParts.map((c) => `${c.count} ${c.label}`).join(" · ") : "none";
  context.push(` ${thousands(report.cache.breaks.length)} cache breaks: ${causeText}`);
  const payoff = report.cache.payoff;
  context.push(
    ` 1h cache: paid ${usd(payoff.premiumPaid)} premium, avoided ${usd(payoff.rewritesAvoided)} rewrites, net ${
      payoff.netDollars <= 0 ? "saved" : "paid"
    } ${usd(Math.abs(payoff.netDollars))}`,
  );
  sections.push(context);

  // -- FINDINGS ----------------------------------------------------------------
  const titleWidth = width - 32;
  const findingsHeader = [
    bold("FINDINGS".padEnd(4 + titleWidth)) + "$/week".padStart(8) + "  confidence",
  ];

  const whatifLineCount =
    report.whatif.length > 0
      ? 1 /* header */ + 1 /* actual */ + Math.min(MAX_WHATIF_MODELS, report.whatif.length) + 1 /* caveat */
      : 1 /* header only */;
  const sinceLineCount = 1 /* header */ + Math.max(1, Math.min(MAX_SINCE_ROWS, report.since_last_week.length));
  const pageLineCount = options.pagePath ? 2 /* blank + page */ : 0;
  const sectionCountAfterFindings = 2 /* whatif, since */;
  const blankLinesBeforeFindings = sections.length; // one blank line before each section, including findings
  const blankLinesAfterFindings = sectionCountAfterFindings; // one before whatif, one before since

  const fixedBudget =
    sections.reduce((a, s) => a + s.length, 0) +
    blankLinesBeforeFindings +
    findingsHeader.length +
    blankLinesAfterFindings +
    whatifLineCount +
    sinceLineCount +
    pageLineCount;

  const findingsBudget = Math.max(0, MAX_LINES - fixedBudget);
  const findings: string[] = [...findingsHeader];
  if (report.findings.length === 0) {
    findings.push(" none above threshold this week");
  } else {
    let shown = Math.min(MAX_FINDINGS, report.findings.length);
    while (shown > 0 && 2 * shown + 1 > findingsBudget) shown -= 1;
    report.findings.slice(0, shown).forEach((f, i) => {
      const num = `${i + 1}`.padStart(2);
      const title = truncate(f.title, titleWidth);
      const confidenceText = f.confidence.replace("_", " ");
      const confidenceStyled =
        f.confidence === "measured"
          ? confidenceText
          : f.confidence === "lower_bound"
            ? dim(confidenceText)
            : paint(color, ANSI.dim + ANSI.italic, confidenceText);
      findings.push(
        ` ${num}  ${padLine(title, titleWidth)}${usd(f.dollars).padStart(8)}  ${confidenceStyled}`,
      );
      findings.push(`    ${dim(truncate(f.action, width - 4))}`);
    });
    if (shown > 0 && report.findings[0]!.resumeCommand) {
      findings.push(dim(truncate(` reopen #1: ${report.findings[0]!.resumeCommand}`, width)));
    }
  }
  sections.push(findings);

  // -- WHAT IF ------------------------------------------------------------------
  const whatif: string[] = [bold("WHAT IF")];
  if (report.whatif.length > 0) {
    const rows = report.whatif.slice(0, MAX_WHATIF_MODELS);
    const nameWidth = Math.max(
      "actual".length,
      ...rows.map((r) => r.label.length),
    );
    whatif.push(` ${padLine("actual", nameWidth)}   ${usd(report.totals.dollars).padStart(10)}`);
    for (const row of rows) {
      const delta = row.deltaDollars;
      const pctDelta = report.totals.dollars === 0 ? 0 : (delta / report.totals.dollars) * 100;
      const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
      const deltaText = `${sign}${usd(Math.abs(delta))} (${sign}${Math.abs(Math.round(pctDelta))}%)`;
      whatif.push(
        ` ${padLine(row.label, nameWidth)}   ${usd(row.totalDollars).padStart(10)}   ${dim(deltaText)}`,
      );
    }
    whatif.push(` ${dim(truncate(WHATIF_CAVEAT_SHORT, width - 1))}`);
  }
  sections.push(whatif);

  // -- SINCE LAST WEEK ------------------------------------------------------------
  const since: string[] = [bold("SINCE LAST WEEK")];
  if (report.since_last_week.length > 0) {
    for (const row of report.since_last_week.slice(0, MAX_SINCE_ROWS)) {
      const arrow = row.direction === "up" ? "▲" : row.direction === "down" ? "▼" : "→";
      since.push(
        ` ${row.rule}  ${truncate(row.title, width - 40)}  ${usd(row.metricThen)} → ${usd(row.metricNow)} ${arrow}`,
      );
    }
  } else {
    since.push(dim(" no previous week recorded"));
  }
  sections.push(since);

  const lines: string[] = [];
  sections.forEach((section, i) => {
    if (i > 0) lines.push("");
    lines.push(...section);
  });
  if (options.pagePath) {
    lines.push("");
    lines.push(dim(truncate(` page  ${options.pagePath}`, width)));
  }

  return lines.join("\n");
}
