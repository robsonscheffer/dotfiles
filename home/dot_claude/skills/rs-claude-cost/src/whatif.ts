// Reprices the week's exact tokens on every what-if model in pricing.json.
// Token counts never change across rows (AC7); only the price does.

import { priceTokens, type PricedModel, type PricingTable } from "./pricing.ts";
import { emptyTokenCounts, type Thread, type TokenCounts, type WhatifRow } from "./types.ts";

export const WHATIF_CAVEAT =
  "This table reprices this week's exact tokens on each model; it is not a prediction. " +
  "The same tokens on a cheaper model may need more turns, and Claude 4.7 and later models " +
  "produce about 30% more tokens for the same text than Sonnet 4.6 and earlier, so this sets " +
  "an upper bound on savings, not a forecast.";

export const WHATIF_CAVEAT_SHORT =
  "upper bound, not a forecast: cheaper models may need more turns; 4.7+ models count ~30% more tokens";

function sumTokens(threads: Thread[], kind: "main" | "subagent"): TokenCounts {
  const tokens = emptyTokenCounts();
  for (const thread of threads) {
    if (thread.kind !== kind) continue;
    for (const turn of thread.turns) {
      tokens.input += turn.tokens.input;
      tokens.cache_read += turn.tokens.cache_read;
      tokens.cache_write_5m += turn.tokens.cache_write_5m;
      tokens.cache_write_1h += turn.tokens.cache_write_1h;
      tokens.output += turn.tokens.output;
    }
  }
  return tokens;
}

function priceThreadsOnModel(threads: Thread[], kind: "main" | "subagent", model: PricedModel): number {
  let dollars = 0;
  for (const thread of threads) {
    if (thread.kind !== kind) continue;
    for (const turn of thread.turns) {
      const rates = (turn.speed === "fast" && model.fast_usd_per_mtok) || model.usd_per_mtok;
      dollars += priceTokens(turn.tokens, rates);
    }
  }
  return Math.round(dollars);
}

export function computeWhatif(threads: Thread[], table: PricingTable, actualTotalDollars: number): WhatifRow[] {
  const rows: WhatifRow[] = [];
  for (const model of table.models) {
    if (!model.whatif) continue;
    const mainDollars = priceThreadsOnModel(threads, "main", model);
    const subagentDollars = priceThreadsOnModel(threads, "subagent", model);
    const totalDollars = mainDollars + subagentDollars;
    rows.push({
      model: model.id,
      totalDollars,
      mainDollars,
      subagentDollars,
      deltaDollars: totalDollars - actualTotalDollars,
    });
  }
  return rows.sort((a, b) => a.totalDollars - b.totalDollars);
}

// Exposed for tests that want to assert token counts stay identical across
// what-if models.
export { sumTokens as sumTokensForTest };
