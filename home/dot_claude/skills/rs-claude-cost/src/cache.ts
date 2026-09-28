// Cache breaks, causes, the 1-hour payoff, and fixed overhead. Timestamps
// mark when a line was written, not when the request started, so gaps
// between turns are approximate; a 60-second margin absorbs most of that.

import { matchModel, type PricingTable } from "./pricing.ts";
import type {
  CacheBreak,
  CacheBreakCause,
  CacheMetrics,
  OverheadMetrics,
  PayoffSummary,
  Session,
  Thread,
} from "./types.ts";

const HALF = 0.5;
const MIN_WRITE_TOKENS_FOR_BREAK = 10_000;
const MARGIN_MS = 60_000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function writtenTokens(turn: { tokens: { cache_write_5m: number; cache_write_1h: number } }): number {
  return turn.tokens.cache_write_5m + turn.tokens.cache_write_1h;
}

/** True when a compaction event's timestamp falls strictly between the two turns. */
function compactionBetween(thread: Thread, afterMs: number, beforeMs: number): boolean {
  return thread.events.some(
    (e) => e.type === "compaction" && e.timestampMs > afterMs && e.timestampMs <= beforeMs,
  );
}

export function detectCacheBreaks(threads: Thread[], table: PricingTable): CacheBreak[] {
  const breaks: CacheBreak[] = [];

  for (const thread of threads) {
    for (let i = 1; i < thread.turns.length; i += 1) {
      const prev = thread.turns[i - 1]!;
      const curr = thread.turns[i]!;

      if (curr.tokens.cache_read >= prev.promptSize * HALF) continue;
      if (writtenTokens(curr) < MIN_WRITE_TOKENS_FOR_BREAK) continue;

      let cause: CacheBreakCause;
      let countedAsWaste: boolean;

      if (compactionBetween(thread, prev.timestampMs, curr.timestampMs)) {
        cause = "compaction";
        countedAsWaste = false;
      } else if (curr.model !== prev.model) {
        cause = "model_switch";
        countedAsWaste = true;
      } else {
        const lifetimeMs = prev.tokens.cache_write_1h > 0 ? ONE_HOUR_MS : FIVE_MINUTES_MS;
        const gapMs = curr.timestampMs - prev.timestampMs;
        if (gapMs > lifetimeMs + MARGIN_MS) {
          cause = "idle_expiry";
          countedAsWaste = true;
        } else {
          cause = "unknown";
          countedAsWaste = true;
        }
      }

      const model = matchModel(table, curr.model);
      let dollars = 0;
      if (model) {
        const rates = (curr.speed === "fast" && model.fast_usd_per_mtok) || model.usd_per_mtok;
        const written = writtenTokens(curr);
        const writeRate =
          curr.tokens.cache_write_1h >= curr.tokens.cache_write_5m
            ? rates.cache_write_1h
            : rates.cache_write_5m;
        dollars = Math.round(written * (writeRate - rates.cache_read));
      }

      breaks.push({
        threadId: thread.id,
        timestamp: curr.timestamp,
        cause,
        countedAsWaste,
        dollars,
      });
    }
  }

  return breaks;
}

export type PayoffOutcome = "not_needed" | "saved" | "expired";

export function computePayoff(threads: Thread[], table: PricingTable): PayoffSummary {
  const summary: PayoffSummary = { notNeeded: 0, saved: 0, expired: 0, netDollars: 0 };

  for (const thread of threads) {
    for (let i = 0; i < thread.turns.length; i += 1) {
      const turn = thread.turns[i]!;
      if (turn.tokens.cache_write_1h <= 0) continue;
      const next = thread.turns[i + 1];
      const model = matchModel(table, turn.model);
      const rates = model && ((turn.speed === "fast" && model.fast_usd_per_mtok) || model.usd_per_mtok);

      if (!next) {
        summary.expired += 1;
        if (rates) summary.netDollars += Math.round(turn.tokens.cache_write_1h * rates.cache_write_1h);
        continue;
      }

      const gapMs = next.timestampMs - turn.timestampMs;
      if (gapMs < FIVE_MINUTES_MS) {
        summary.notNeeded += 1;
        if (rates) {
          summary.netDollars += Math.round(
            turn.tokens.cache_write_1h * (rates.cache_write_1h - rates.cache_write_5m),
          );
        }
      } else if (gapMs <= ONE_HOUR_MS) {
        summary.saved += 1;
      } else {
        summary.expired += 1;
        if (rates) summary.netDollars += Math.round(turn.tokens.cache_write_1h * rates.cache_write_1h);
      }
    }
  }

  return summary;
}

export function computeCacheMetrics(threads: Thread[], table: PricingTable): CacheMetrics {
  let cacheRead = 0;
  let promptTotal = 0;
  for (const thread of threads) {
    for (const turn of thread.turns) {
      cacheRead += turn.tokens.cache_read;
      promptTotal += turn.promptSize;
    }
  }

  const breaks = detectCacheBreaks(threads, table);
  const breaksByCause: Record<CacheBreakCause, number> = {
    compaction: 0,
    model_switch: 0,
    idle_expiry: 0,
    unknown: 0,
  };
  for (const b of breaks) breaksByCause[b.cause] += 1;

  return {
    hitRate: promptTotal === 0 ? 0 : cacheRead / promptTotal,
    breaks,
    breaksByCause,
    payoff: computePayoff(threads, table),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

export function computeOverhead(
  threads: Thread[],
  sessions: Session[],
  table: PricingTable,
): OverheadMetrics {
  const threadById = new Map(threads.map((t) => [t.id, t]));
  const firstTurnSizes = sessions
    .map((s) => threadById.get(s.mainThreadId)?.turns[0]?.promptSize)
    .filter((v): v is number => v !== undefined);

  let latestListing: { timestampMs: number; bytes: number; skillCount: number } | null = null;
  for (const thread of threads) {
    for (const event of thread.events) {
      if (event.type !== "skill_listing") continue;
      if (!latestListing || event.timestampMs > latestListing.timestampMs) {
        latestListing = { timestampMs: event.timestampMs, bytes: event.bytes, skillCount: event.skillCount };
      }
    }
  }

  const catalogTokensEstimate = latestListing ? latestListing.bytes / 4 : 0;
  let catalogCostEstimate = 0;
  if (catalogTokensEstimate > 0) {
    for (const thread of threads) {
      for (const turn of thread.turns) {
        const model = matchModel(table, turn.model);
        if (!model) continue;
        const rates = (turn.speed === "fast" && model.fast_usd_per_mtok) || model.usd_per_mtok;
        catalogCostEstimate += catalogTokensEstimate * rates.cache_read;
      }
    }
  }

  return {
    firstTurnPromptSizeMedian: median(firstTurnSizes),
    catalogSizeBytes: latestListing?.bytes ?? 0,
    catalogSkillCount: latestListing?.skillCount ?? 0,
    catalogTokensEstimate,
    catalogCostEstimate: Math.round(catalogCostEstimate),
  };
}
