import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPricing, matchModel, priceTurn } from "../src/pricing.ts";
import type { Turn } from "../src/types.ts";
import { emptyTokenCounts } from "../src/types.ts";

const PRICING_PATH = join(import.meta.dir, "..", "pricing.json");

function baseTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    messageId: "m1",
    threadId: "t1",
    timestamp: "2026-09-22T10:00:00.000Z",
    timestampMs: Date.parse("2026-09-22T10:00:00.000Z"),
    model: "claude-sonnet-5",
    speed: "standard",
    tokens: emptyTokenCounts(),
    promptSize: 0,
    compactedSincePrevious: false,
    toolUses: [],
    images: [],
    ...overrides,
  };
}

describe("pricing", () => {
  test("an Opus 5.5 cache read prices at $0.20 per million", () => {
    const table = loadPricing(PRICING_PATH, new Date("2026-09-28"));
    const turn = baseTurn({
      model: "claude-opus-5-5",
      tokens: { ...emptyTokenCounts(), cache_read: 1_000_000 },
    });
    const { dollars, priced } = priceTurn(table, turn);
    expect(priced).toBe(true);
    expect(dollars).toBe(200_000); // $0.20 in micro-dollars
  });

  test("a fast-mode turn uses fast prices", () => {
    const table = loadPricing(PRICING_PATH, new Date("2026-09-28"));
    const turn = baseTurn({
      model: "claude-opus-5-5",
      speed: "fast",
      tokens: { ...emptyTokenCounts(), input: 1_000_000 },
    });
    const { dollars } = priceTurn(table, turn);
    expect(dollars).toBe(8_000_000); // fast input rate is $8/MTok
  });

  test("most specific pattern wins: opus-5-5 never matches as opus-5", () => {
    const table = loadPricing(PRICING_PATH, new Date("2026-09-28"));
    const model = matchModel(table, "claude-opus-5-5-20260101");
    expect(model?.id).toBe("claude-opus-5-5");
  });

  test("an unknown model is unpriced and exits 2", () => {
    const table = loadPricing(PRICING_PATH, new Date("2026-09-28"));
    const turn = baseTurn({ model: "claude-nonexistent-9" });
    const { priced } = priceTurn(table, turn);
    expect(priced).toBe(false);
  });

  test("a 61-day-old as_of warns as stale", () => {
    const dir = mkdtempSync(join(tmpdir(), "rs-cost-stale-"));
    const path = join(dir, "pricing.json");
    writeFileSync(
      path,
      JSON.stringify({
        as_of: "2026-01-01",
        source: "test",
        models: [{ id: "claude-sonnet-5", whatif: true, usd_per_mtok: { input: 2, cache_write_5m: 2.5, cache_write_1h: 4, cache_read: 0.2, output: 10 } }],
      }),
    );
    const table = loadPricing(path, new Date("2026-09-28"));
    expect(table.stale).toBe(true);
    expect(table.ageDays).toBeGreaterThan(60);
  });
});
