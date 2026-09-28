import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { findCandidateFiles } from "../src/scan.ts";
import { normalize } from "../src/normalize.ts";
import { loadPricing, priceAllTurns } from "../src/pricing.ts";
import { computePayoff, detectCacheBreaks } from "../src/cache.ts";
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

// A break needs: cache_read on turn 2 < half of turn 1's promptSize, and
// turn 2 wrote at least 10,000 tokens.
const BIG_PROMPT_USAGE = {
  input_tokens: 200_000,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  output_tokens: 100,
};

function breakingUsage(cacheWrite5m: number, cacheWrite1h: number, cacheRead = 0) {
  return {
    input_tokens: 100,
    cache_read_input_tokens: cacheRead,
    cache_creation: { ephemeral_5m_input_tokens: cacheWrite5m, ephemeral_1h_input_tokens: cacheWrite1h },
    output_tokens: 100,
  };
}

describe("cache breaks", () => {
  test("a 70-minute gap after a 1-hour write is idle expiry", async () => {
    const root = makeTmpRoot("rs-cost-idle-expiry");
    writeJsonl(join(root, "proj1", "session-a.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: breakingUsage(0, 20_000), // wrote a 1h cache
      }),
      assistantLine({
        messageId: "m2",
        timestamp: "2026-09-22T11:10:00.000Z", // 70 minutes later
        model: "claude-sonnet-5",
        usage: breakingUsage(20_000, 0), // re-wrote from scratch: cache_read stays 0
      }),
    ]);
    const { threads, table } = await buildThreads(root);
    const breaks = detectCacheBreaks(threads, table);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]!.cause).toBe("idle_expiry");
    expect(breaks[0]!.countedAsWaste).toBe(true);
  });

  test("a model change is a switch", async () => {
    const root = makeTmpRoot("rs-cost-model-switch");
    writeJsonl(join(root, "proj1", "session-b.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: BIG_PROMPT_USAGE,
      }),
      assistantLine({
        messageId: "m2",
        timestamp: "2026-09-22T10:01:00.000Z", // 1 minute later, well within any lifetime
        model: "claude-opus-5-5",
        usage: breakingUsage(20_000, 0),
      }),
    ]);
    const { threads, table } = await buildThreads(root);
    const breaks = detectCacheBreaks(threads, table);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]!.cause).toBe("model_switch");
    expect(breaks[0]!.countedAsWaste).toBe(true);
  });

  test("a compaction between two turns is excluded from waste", async () => {
    const root = makeTmpRoot("rs-cost-compaction-break");
    writeJsonl(join(root, "proj1", "session-c.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: BIG_PROMPT_USAGE,
      }),
      {
        type: "system",
        subtype: "compact_boundary",
        timestamp: "2026-09-22T10:00:30.000Z",
        compactMetadata: { trigger: "auto", preTokens: 200_000, postTokens: 5_000 },
      },
      assistantLine({
        messageId: "m2",
        timestamp: "2026-09-22T10:01:00.000Z",
        model: "claude-sonnet-5",
        usage: breakingUsage(20_000, 0),
      }),
    ]);
    const { threads, table } = await buildThreads(root);
    const breaks = detectCacheBreaks(threads, table);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]!.cause).toBe("compaction");
    expect(breaks[0]!.countedAsWaste).toBe(false);
  });

  test("no break when cache read stays above half of the previous prompt", async () => {
    const root = makeTmpRoot("rs-cost-no-break");
    writeJsonl(join(root, "proj1", "session-d.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: BIG_PROMPT_USAGE, // promptSize 200,000
      }),
      assistantLine({
        messageId: "m2",
        timestamp: "2026-09-22T10:01:00.000Z",
        model: "claude-sonnet-5",
        usage: breakingUsage(20_000, 0, 150_000), // cache_read 150k > half of 200k
      }),
    ]);
    const { threads, table } = await buildThreads(root);
    const breaks = detectCacheBreaks(threads, table);
    expect(breaks).toHaveLength(0);
  });
});

describe("1-hour payoff", () => {
  test("a 1-hour write followed 2 minutes later is not needed", async () => {
    const root = makeTmpRoot("rs-cost-payoff-not-needed");
    writeJsonl(join(root, "proj1", "session-e.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: breakingUsage(0, 20_000),
      }),
      assistantLine({
        messageId: "m2",
        timestamp: "2026-09-22T10:02:00.000Z", // 2 minutes later
        model: "claude-sonnet-5",
        usage: breakingUsage(0, 0, 20_000),
      }),
    ]);
    const { threads, table } = await buildThreads(root);
    const payoff = computePayoff(threads, table);
    expect(payoff.notNeeded).toBe(1);
    expect(payoff.saved).toBe(0);
    expect(payoff.expired).toBe(0);
  });

  test("a 1-hour write reused after 30 minutes saved a rewrite", async () => {
    const root = makeTmpRoot("rs-cost-payoff-saved");
    writeJsonl(join(root, "proj1", "session-f.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: breakingUsage(0, 20_000),
      }),
      assistantLine({
        messageId: "m2",
        timestamp: "2026-09-22T10:30:00.000Z",
        model: "claude-sonnet-5",
        usage: breakingUsage(0, 0, 20_000),
      }),
    ]);
    const { threads, table } = await buildThreads(root);
    const payoff = computePayoff(threads, table);
    expect(payoff.saved).toBe(1);
  });

  test("a 1-hour write reused after 90 minutes expired unused", async () => {
    const root = makeTmpRoot("rs-cost-payoff-expired");
    writeJsonl(join(root, "proj1", "session-g.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: breakingUsage(0, 20_000),
      }),
      assistantLine({
        messageId: "m2",
        timestamp: "2026-09-22T11:30:00.000Z",
        model: "claude-sonnet-5",
        usage: breakingUsage(20_000, 0),
      }),
    ]);
    const { threads, table } = await buildThreads(root);
    const payoff = computePayoff(threads, table);
    expect(payoff.expired).toBe(1);
  });
});
