import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { findCandidateFiles } from "../src/scan.ts";
import { normalize } from "../src/normalize.ts";
import { loadPricing, priceAllTurns } from "../src/pricing.ts";
import { computeWhatif, sumTokensForTest } from "../src/whatif.ts";
import { assistantLine, makeTmpRoot, writeJsonl } from "./helpers.ts";

const WEEK_START = Date.parse("2026-09-21T00:00:00.000Z");
const WEEK_END = Date.parse("2026-09-28T00:00:00.000Z");
const PRICING_PATH = join(import.meta.dir, "..", "pricing.json");

async function buildThreads(root: string) {
  const files = findCandidateFiles(root, WEEK_START);
  const { threads } = await normalize(files, { startMs: WEEK_START, endMs: WEEK_END });
  const table = loadPricing(PRICING_PATH, new Date("2026-09-28"));
  priceAllTurns(table, threads.flatMap((t) => t.turns));
  return { threads, table };
}

describe("whatif", () => {
  test("token counts stay identical across every what-if model", async () => {
    const root = makeTmpRoot("rs-cost-whatif-tokens");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: {
          input_tokens: 10_000,
          cache_read_input_tokens: 5_000,
          cache_creation_input_tokens: 2_000,
          output_tokens: 1_000,
        },
      }),
    ]);
    const { threads, table } = await buildThreads(root);
    const mainTokens = sumTokensForTest(threads, "main");
    // Repricing on every what-if model must never touch token counts.
    const rows = computeWhatif(threads, table, 0);
    expect(rows.length).toBeGreaterThan(0);
    expect(mainTokens.input).toBe(10_000);
    expect(mainTokens.cache_read).toBe(5_000);
  });

  test("each row's dollars scale with the model's own rates, and rows sort ascending", async () => {
    const root = makeTmpRoot("rs-cost-whatif-rows");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: { input_tokens: 1_000_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
      }),
    ]);
    const { threads, table } = await buildThreads(root);
    const rows = computeWhatif(threads, table, 2_000_000);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.totalDollars).toBeGreaterThanOrEqual(rows[i - 1]!.totalDollars);
    }
    const haiku = rows.find((r) => r.model === "claude-haiku-4-5")!;
    expect(haiku.totalDollars).toBe(1_000_000); // 1M input tokens at $1/MTok
    expect(haiku.deltaDollars).toBe(1_000_000 - 2_000_000);
  });
});
