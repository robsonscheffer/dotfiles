// Loads pricing.json and prices turns. Prices are data, not code: each model
// lists explicit USD-per-million-token rates for every token kind, plus an
// optional fast-mode table. Matching is by longest-prefix, so a more specific
// id (claude-opus-5-5) is tried before a shorter one it also starts with
// (claude-opus-5).

import { readFileSync } from "node:fs";
import type { TokenCounts, Turn } from "./types.ts";

export interface ModelRates {
  input: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cache_read: number;
  output: number;
}

export interface PricedModel {
  id: string;
  label?: string;
  whatif: boolean;
  usd_per_mtok: ModelRates;
  fast_usd_per_mtok?: ModelRates;
}

/** The model's display label, falling back to its raw id when no label is set. */
export function modelLabel(table: PricingTable, modelId: string): string {
  const model = matchModel(table, modelId);
  return model?.label ?? modelId;
}

export interface PricingFile {
  as_of: string;
  source: string;
  models: PricedModel[];
}

export interface PricingTable {
  file: string;
  as_of: string;
  ageDays: number;
  stale: boolean;
  /** models sorted longest-id first, for prefix matching */
  models: PricedModel[];
}

const STALE_AFTER_DAYS = 60;

export function loadPricing(path: string, now: Date = new Date()): PricingTable {
  const raw = JSON.parse(readFileSync(path, "utf8")) as PricingFile;
  const ageMs = now.getTime() - Date.parse(raw.as_of);
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  return {
    file: path,
    as_of: raw.as_of,
    ageDays,
    stale: ageDays > STALE_AFTER_DAYS,
    models: [...raw.models].sort((a, b) => b.id.length - a.id.length),
  };
}

export function matchModel(table: PricingTable, modelId: string): PricedModel | null {
  for (const model of table.models) {
    if (modelId.startsWith(model.id)) return model;
  }
  return null;
}

export interface PriceResult {
  dollars: number;
  priced: boolean;
}

/** Prices one turn's tokens in integer micro-dollars ($1 = 1_000_000 micro-dollars). */
export function priceTurn(table: PricingTable, turn: Turn): PriceResult {
  const model = matchModel(table, turn.model);
  if (!model) return { dollars: 0, priced: false };
  const rates = (turn.speed === "fast" && model.fast_usd_per_mtok) || model.usd_per_mtok;
  return { dollars: priceTokens(turn.tokens, rates), priced: true };
}

export function priceTokens(tokens: TokenCounts, rates: ModelRates): number {
  return Math.round(
    tokens.input * rates.input +
      tokens.cache_read * rates.cache_read +
      tokens.cache_write_5m * rates.cache_write_5m +
      tokens.cache_write_1h * rates.cache_write_1h +
      tokens.output * rates.output,
  );
}

export function priceAllTurns(table: PricingTable, turns: Turn[]): { unknownModels: Set<string>; unpricedTokens: number } {
  const unknownModels = new Set<string>();
  let unpricedTokens = 0;
  for (const turn of turns) {
    const { dollars, priced } = priceTurn(table, turn);
    turn.dollars = dollars;
    turn.priced = priced;
    if (!priced) {
      unknownModels.add(turn.model);
      unpricedTokens +=
        turn.tokens.input +
        turn.tokens.cache_read +
        turn.tokens.cache_write_5m +
        turn.tokens.cache_write_1h +
        turn.tokens.output;
    }
  }
  return { unknownModels, unpricedTokens };
}
