// Assembles the single report object (D2). Every renderer and every later
// step (rules, what-if, history) reads from this object; none recomputes.

import { findCandidateFiles } from "./scan.ts";
import { normalize } from "./normalize.ts";
import { loadPricing, priceAllTurns, type PricingTable } from "./pricing.ts";
import {
  computeByKind,
  computeByModel,
  computeByThread,
  computeContext,
  computeTotals,
  fillSessionDollars,
  reconcile,
} from "./metrics.ts";
import { computeCacheMetrics, computeOverhead } from "./cache.ts";
import { evaluateRules, loadThresholds } from "./rules.ts";
import { computeWhatif } from "./whatif.ts";
import { buildSinceLastWeek, hasPriorWeek, previousWeekTotal, recordWeek } from "./history.ts";
import type { WeekRange, TimeZoneMode } from "./date.ts";
import type { DataQuality, Report, Thread } from "./types.ts";

export interface BuildReportOptions {
  root: string;
  week: WeekRange;
  tz: TimeZoneMode;
  pricingPath: string;
  thresholdsPath: string;
  outDir: string;
  noRecord: boolean;
}

export interface BuildReportResult {
  report: Report;
  reconciled: boolean;
  exitCode: 0 | 1 | 2;
  hasPriorWeek: boolean;
  priorWeekTotalDollars: number | null;
}

function allTurns(threads: Thread[]) {
  return threads.flatMap((t) => t.turns);
}

export async function buildReport(options: BuildReportOptions): Promise<BuildReportResult> {
  const files = findCandidateFiles(options.root, options.week.start.getTime());
  const { threads, sessions, dataQuality: dq } = await normalize(files, {
    startMs: options.week.start.getTime(),
    endMs: options.week.end.getTime(),
  });

  const table: PricingTable = loadPricing(options.pricingPath);
  const turns = allTurns(threads);
  const { unknownModels, unpricedTokens } = priceAllTurns(table, turns);

  fillSessionDollars(sessions, threads);

  const totals = computeTotals(threads);
  totals.sessions = sessions.length;
  const byKind = computeByKind(threads, table);
  const byModel = computeByModel(threads, table);
  const byThread = computeByThread(threads);
  const context = computeContext(threads, table);
  const cache = computeCacheMetrics(threads, table);
  const overhead = computeOverhead(threads, sessions, table);

  const reconciled = reconcile({ totals, byKind, sessions, byThread });

  const threadById = new Map(threads.map((t) => [t.id, t]));
  for (const session of sessions) {
    const main = threadById.get(session.mainThreadId);
    if (!main) continue;
    for (const b of cache.breaks) {
      if (b.threadId !== session.mainThreadId) continue;
      const turnIndex = main.turns.findIndex((t) => t.timestamp === b.timestamp);
      if (turnIndex >= 0) session.cacheBreaks.push({ turnIndex, cause: b.cause });
    }
  }

  const thresholds = loadThresholds(options.thresholdsPath);
  const findings = evaluateRules({
    threads,
    sessions,
    context,
    cache,
    overhead,
    table,
    thresholds,
  });
  const whatif = computeWhatif(threads, table, totals.dollars);
  const sinceLastWeek = reconciled
    ? buildSinceLastWeek(options.outDir, options.week.isoWeek, options.tz, findings)
    : [];
  const priorWeek = hasPriorWeek(options.outDir, options.week.isoWeek);
  const priorWeekTotalDollars = previousWeekTotal(options.outDir, options.week.isoWeek, options.tz);

  if (reconciled && !options.noRecord) {
    recordWeek(options.outDir, options.week.isoWeek, totals, findings);
  }

  const dataQuality: DataQuality = {
    filesRead: dq.filesRead,
    filesFailed: dq.filesFailed,
    duplicateLinesDropped: dq.duplicateLinesDropped,
    unknownRecordTypes: dq.unknownRecordTypes,
    claudeCodeVersions: [...dq.claudeCodeVersions].sort(),
    unknownModels: Object.fromEntries([...unknownModels].map((m) => [m, 1])),
    unpricedTokens,
    pricingStale: table.stale,
    pricingAsOf: table.as_of,
    pricingAgeDays: table.ageDays,
    inferenceGeoValues: dq.inferenceGeoValues,
    reconciliation: reconciled ? "pass" : "fail",
  };

  const activeDays = new Set(
    turns.map((t) => new Date(t.timestampMs).toISOString().slice(0, 10)),
  ).size;

  const report: Report = {
    schema_version: 1,
    window: {
      start: options.week.start.toISOString(),
      end: options.week.end.toISOString(),
      tz: options.tz,
      isoWeek: options.week.isoWeek,
      activeDays,
      missingDays: Math.max(0, 7 - activeDays),
    },
    pricing: {
      file: table.file,
      as_of: table.as_of,
      ageDays: table.ageDays,
      stale: table.stale,
      unknownModels: [...unknownModels],
      unpricedTokens,
    },
    totals,
    by_kind: byKind,
    by_model: byModel,
    by_thread: byThread,
    context,
    cache,
    overhead,
    sessions,
    findings,
    whatif,
    since_last_week: sinceLastWeek,
    data_quality: dataQuality,
  };

  let exitCode: 0 | 1 | 2 = 0;
  if (!reconciled) {
    exitCode = 1;
  } else if (
    unknownModels.size > 0 ||
    table.stale ||
    dataQuality.filesFailed.length > 0
  ) {
    exitCode = 2;
  }

  return { report, reconciled, exitCode, hasPriorWeek: priorWeek, priorWeekTotalDollars };
}
