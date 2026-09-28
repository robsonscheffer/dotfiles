// The terminal summary: the default output. At most 45 lines at 100 columns,
// colored on a TTY unless NO_COLOR is set (D1: renders the one report
// object; it never recomputes a number).

import type { Report, TokenKind } from "../types.ts";
import { WHATIF_CAVEAT_SHORT } from "../whatif.ts";

const WIDTH = 100;
const MAX_BAR = 24;

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function usd(microDollars: number): string {
  const dollars = microDollars / 1_000_000;
  const sign = dollars < 0 ? "-" : "";
  return `${sign}$${Math.abs(dollars).toFixed(2)}`;
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function bar(share: number): string {
  const filled = Math.max(0, Math.min(MAX_BAR, Math.round(share * MAX_BAR)));
  return "█".repeat(filled) + " ".repeat(MAX_BAR - filled);
}

export interface RenderCliOptions {
  color: boolean;
  hasPriorWeek: boolean;
}

function paint(color: boolean, code: string, text: string): string {
  return color ? `${code}${text}${ANSI.reset}` : text;
}

const KIND_LABELS: Record<TokenKind, string> = {
  cache_read: "re-reading context",
  cache_write_1h: "storing context 1h",
  cache_write_5m: "storing context 5m",
  output: "Claude writing",
  input: "fresh input",
};

export function renderCli(report: Report, options: RenderCliOptions): string {
  const { color } = options;
  const lines: string[] = [];
  const divider = "─".repeat(WIDTH);

  // window.start/end are UTC instants at a week boundary in report.window.tz;
  // format in that same zone so a UTC-zoned week always prints its own
  // calendar day regardless of the host machine's local time zone.
  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: report.window.tz === "UTC" ? "UTC" : undefined,
    });

  lines.push(
    `rs-claude-cost · ${report.window.isoWeek} · ${dateFmt(report.window.start)} to ${dateFmt(
      new Date(new Date(report.window.end).getTime() - 86_400_000).toISOString(),
    )} · ${report.window.tz} time · list prices`,
  );
  lines.push(divider);

  const trend = options.hasPriorWeek ? "" : "▲ first week, no trend";
  lines.push(
    ` ${paint(color, ANSI.bold, usd(report.totals.dollars))}` +
      `     ${report.totals.sessions} sessions   ${report.totals.turns} turns   ${report.window.activeDays} active days   ${trend}`,
  );
  lines.push(divider);

  lines.push("WHERE IT WENT");
  const kinds: TokenKind[] = ["cache_read", "cache_write_1h", "output", "cache_write_5m", "input"];
  const sortedKinds = [...kinds].sort((a, b) => report.by_kind[b].dollars - report.by_kind[a].dollars);
  for (const kind of sortedKinds) {
    const row = report.by_kind[kind];
    if (row.dollars === 0) continue;
    const label = KIND_LABELS[kind].padEnd(20);
    lines.push(` ${label} ${bar(row.share)}   ${usd(row.dollars).padStart(6)}   ${pct(row.share).padStart(3)}`);
  }

  lines.push("CONTEXT AND CACHE");
  const heavyBins = report.context.bins.filter((b) => b.label === "150k_to_300k" || b.label === "over_300k");
  const heavyDollars = heavyBins.reduce((a, b) => a + b.dollars, 0);
  const heavyShare = report.totals.dollars === 0 ? 0 : heavyDollars / report.totals.dollars;
  lines.push(
    ` cache hit rate ${pct(report.cache.hitRate)}   median context ${Math.round(
      report.context.median / 1000,
    )}K   p90 ${Math.round(report.context.p90 / 1000)}K`,
  );
  lines.push(
    ` turns above 150K cost ${pct(heavyShare)} of the week`,
  );
  const byCause = report.cache.breaksByCause;
  lines.push(
    ` cache breaks  ${report.cache.breaks.length}   idle ${byCause.idle_expiry} · model switch ${byCause.model_switch} · compaction ${byCause.compaction} · unknown ${byCause.unknown}`,
  );
  const payoff = report.cache.payoff;
  lines.push(
    ` 1h cache: paid ${usd(payoff.premiumPaid)} premium, avoided ${usd(payoff.rewritesAvoided)} rewrites, net ${
      payoff.netDollars <= 0 ? "saved" : "paid"
    } ${usd(Math.abs(payoff.netDollars))}`,
  );

  const titleWidth = WIDTH - 26;
  lines.push("FINDINGS".padEnd(4 + titleWidth) + "$ / week".padStart(8) + "   confidence");
  if (report.findings.length === 0) {
    lines.push(" none above threshold this week");
  } else {
    report.findings.slice(0, 6).forEach((f, i) => {
      const num = `${i + 1}`.padStart(2);
      const title = f.title.length > titleWidth ? `${f.title.slice(0, titleWidth - 3)}...` : f.title;
      lines.push(
        ` ${num} ${title.padEnd(titleWidth)}${usd(f.dollars).padStart(8)}   ${f.confidence.replace("_", " ")}`,
      );
      if (f.resumeCommand) lines.push(`    ${f.resumeCommand}`);
    });
  }

  if (report.whatif.length > 0) {
    const cols = report.whatif.slice(0, 3);
    const colWidth = Math.max(12, ...cols.map((c) => `all on ${c.model}`.length + 2));
    lines.push(
      "MODELS" +
        "actual".padStart(24 - "MODELS".length) +
        cols.map((c) => `all on ${c.model}`.padStart(colWidth)).join(""),
    );
    lines.push(
      ` total` +
        usd(report.totals.dollars).padStart(24 - " total".length) +
        cols.map((c) => usd(c.totalDollars).padStart(colWidth)).join(""),
    );
    lines.push(` ${WHATIF_CAVEAT_SHORT}`);
  }

  if (report.since_last_week.length > 0) {
    lines.push("SINCE LAST WEEK");
    for (const row of report.since_last_week.slice(0, 4)) {
      const arrow = row.direction === "up" ? "▲" : row.direction === "down" ? "▼" : "→";
      lines.push(
        ` ${row.rule} ${row.title.padEnd(35)} ${usd(row.metricThen)} -> ${usd(row.metricNow)} ${arrow}`,
      );
    }
  } else {
    lines.push("SINCE LAST WEEK   (no previous week recorded)");
  }

  const warnings: string[] = [];
  if (report.pricing.stale) warnings.push("pricing file is stale");
  if (report.pricing.unknownModels.length > 0) warnings.push(`unknown model(s): ${report.pricing.unknownModels.join(", ")}`);
  if (report.data_quality.filesFailed.length > 0) warnings.push(`${report.data_quality.filesFailed.length} file(s) failed to read`);
  if (warnings.length > 0) {
    lines.push(paint(color, ANSI.yellow, ` warning: ${warnings.join("; ")}`));
  }

  return lines.join("\n");
}
