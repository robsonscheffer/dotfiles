// Totals, breakdowns, and reconciliation. Sums are kept in integer
// micro-dollars throughout to avoid rounding drift; reconciliation compares
// at cent resolution (1 cent = 10_000 micro-dollars), which comfortably
// absorbs the sub-micro-dollar rounding of individual token-kind prices.

import { matchModel, type PricingTable } from "./pricing.ts";
import {
  emptyTokenCounts,
  type ByKindTotals,
  type ByModelTotals,
  type ByThreadTotals,
  type ContextBin,
  type ContextMetrics,
  type Session,
  type Thread,
  type TokenCounts,
  type TokenKind,
  type Totals,
} from "./types.ts";

const TOKEN_KINDS: TokenKind[] = ["input", "cache_read", "cache_write_5m", "cache_write_1h", "output"];
const EXCESS_CONTEXT_THRESHOLD = 150_000;
const MICRO_DOLLARS_PER_CENT = 10_000;

function toCents(microDollars: number): number {
  return Math.round(microDollars / MICRO_DOLLARS_PER_CENT);
}

export function computeTotals(threads: Thread[]): Totals {
  let dollars = 0;
  let turns = 0;
  const tokens = emptyTokenCounts();
  for (const thread of threads) {
    for (const turn of thread.turns) {
      dollars += turn.dollars ?? 0;
      turns += 1;
      for (const kind of TOKEN_KINDS) tokens[kind] += turn.tokens[kind];
    }
  }
  return { dollars, requests: turns, turns, sessions: 0, tokens };
}

export function computeByKind(
  threads: Thread[],
  table: PricingTable,
): Record<TokenKind, ByKindTotals> {
  const sums: Record<TokenKind, number> = {
    input: 0,
    cache_read: 0,
    cache_write_5m: 0,
    cache_write_1h: 0,
    output: 0,
  };
  for (const thread of threads) {
    for (const turn of thread.turns) {
      const model = matchModel(table, turn.model);
      if (!model) continue;
      const rates = (turn.speed === "fast" && model.fast_usd_per_mtok) || model.usd_per_mtok;
      for (const kind of TOKEN_KINDS) {
        sums[kind] += turn.tokens[kind] * rates[kind];
      }
    }
  }
  const rounded: Record<TokenKind, number> = {
    input: Math.round(sums.input),
    cache_read: Math.round(sums.cache_read),
    cache_write_5m: Math.round(sums.cache_write_5m),
    cache_write_1h: Math.round(sums.cache_write_1h),
    output: Math.round(sums.output),
  };
  const total = TOKEN_KINDS.reduce((acc, k) => acc + rounded[k], 0);
  const result = {} as Record<TokenKind, ByKindTotals>;
  for (const kind of TOKEN_KINDS) {
    result[kind] = {
      dollars: rounded[kind],
      share: total === 0 ? 0 : rounded[kind] / total,
    };
  }
  return result;
}

export function computeByModel(threads: Thread[]): ByModelTotals[] {
  const byModel = new Map<
    string,
    { dollars: number; tokens: TokenCounts; fastDollars: number }
  >();
  for (const thread of threads) {
    for (const turn of thread.turns) {
      const entry = byModel.get(turn.model) ?? {
        dollars: 0,
        tokens: emptyTokenCounts(),
        fastDollars: 0,
      };
      entry.dollars += turn.dollars ?? 0;
      for (const kind of TOKEN_KINDS) entry.tokens[kind] += turn.tokens[kind];
      if (turn.speed === "fast") entry.fastDollars += turn.dollars ?? 0;
      byModel.set(turn.model, entry);
    }
  }
  const totalDollars = [...byModel.values()].reduce((a, e) => a + e.dollars, 0);
  return [...byModel.entries()]
    .map(([model, entry]) => {
      const totalTokens = TOKEN_KINDS.reduce((a, k) => a + entry.tokens[k], 0);
      return {
        model,
        dollars: entry.dollars,
        tokens: entry.tokens,
        dollarsPerMillionTokens: totalTokens === 0 ? 0 : (entry.dollars / 1_000_000 / totalTokens) * 1_000_000,
        share: totalDollars === 0 ? 0 : entry.dollars / totalDollars,
        fastShare: entry.dollars === 0 ? 0 : entry.fastDollars / entry.dollars,
      };
    })
    .sort((a, b) => b.dollars - a.dollars);
}

export function computeByThread(threads: Thread[]): ByThreadTotals {
  let mainDollars = 0;
  let subagentDollars = 0;
  const subagentsByType: Record<string, number> = {};
  for (const thread of threads) {
    const dollars = thread.turns.reduce((a, t) => a + (t.dollars ?? 0), 0);
    if (thread.kind === "main") {
      mainDollars += dollars;
    } else {
      subagentDollars += dollars;
      const type = thread.agentType ?? "unknown";
      subagentsByType[type] = (subagentsByType[type] ?? 0) + dollars;
    }
  }
  return { mainDollars, subagentDollars, subagentsByType };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}

export function computeContext(threads: Thread[], table: PricingTable): ContextMetrics {
  const bins: ContextBin[] = [
    { label: "under_50k", turns: 0, dollars: 0 },
    { label: "50k_to_150k", turns: 0, dollars: 0 },
    { label: "150k_to_300k", turns: 0, dollars: 0 },
    { label: "over_300k", turns: 0, dollars: 0 },
  ];
  const sizes: number[] = [];
  let excessContextCost = 0;

  for (const thread of threads) {
    for (const turn of thread.turns) {
      sizes.push(turn.promptSize);
      const bin =
        turn.promptSize < 50_000
          ? bins[0]!
          : turn.promptSize < 150_000
            ? bins[1]!
            : turn.promptSize < 300_000
              ? bins[2]!
              : bins[3]!;
      bin.turns += 1;
      bin.dollars += turn.dollars ?? 0;

      if (turn.promptSize > EXCESS_CONTEXT_THRESHOLD) {
        const model = matchModel(table, turn.model);
        if (model) {
          const rates = (turn.speed === "fast" && model.fast_usd_per_mtok) || model.usd_per_mtok;
          const excessTokens = turn.promptSize - EXCESS_CONTEXT_THRESHOLD;
          excessContextCost += excessTokens * rates.cache_read;
        }
      }
    }
  }

  const sorted = [...sizes].sort((a, b) => a - b);
  return {
    bins,
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    max: sorted.length ? sorted[sorted.length - 1]! : 0,
    excessContextCost: Math.round(excessContextCost),
  };
}

export interface ReconciliationInput {
  totals: Totals;
  byKind: Record<TokenKind, ByKindTotals>;
  sessions: Session[];
  byThread: ByThreadTotals;
}

export function reconcile(input: ReconciliationInput): boolean {
  const totalCents = toCents(input.totals.dollars);
  const byKindCents = toCents(TOKEN_KINDS.reduce((a, k) => a + input.byKind[k].dollars, 0));
  const byThreadCents = toCents(input.byThread.mainDollars + input.byThread.subagentDollars);
  const bySessionCents = toCents(
    input.sessions.reduce((a, s) => a + (s.mainDollars ?? 0) + (s.subagentDollars ?? 0), 0),
  );
  return totalCents === byKindCents && totalCents === byThreadCents && totalCents === bySessionCents;
}

export function fillSessionDollars(sessions: Session[], threads: Thread[]): void {
  const mainDollarsById = new Map<string, number>();
  const subagentDollarsById = new Map<string, number>();
  for (const thread of threads) {
    const dollars = thread.turns.reduce((a, t) => a + (t.dollars ?? 0), 0);
    if (thread.kind === "main") {
      mainDollarsById.set(thread.id, dollars);
    } else {
      subagentDollarsById.set(thread.sessionId, (subagentDollarsById.get(thread.sessionId) ?? 0) + dollars);
    }
  }
  for (const session of sessions) {
    session.mainDollars = mainDollarsById.get(session.id) ?? 0;
    session.subagentDollars = subagentDollarsById.get(session.id) ?? 0;
  }
}
