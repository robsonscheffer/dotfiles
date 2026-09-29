import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { findCandidateFiles } from "../src/scan.ts";
import { normalize } from "../src/normalize.ts";
import { loadPricing, priceAllTurns } from "../src/pricing.ts";
import {
  computeByKind,
  computeByThread,
  computeContext,
  computeTotals,
  fillSessionDollars,
  reconcile,
} from "../src/metrics.ts";
import { assistantLine, makeTmpRoot, writeJsonl } from "./helpers.ts";
import type { TokenKind } from "../src/types.ts";

const WEEK_START = Date.parse("2026-09-21T00:00:00.000Z");
const WEEK_END = Date.parse("2026-09-28T00:00:00.000Z");
const PRICING_PATH = join(import.meta.dir, "..", "pricing.json");
const TOKEN_KINDS: TokenKind[] = ["input", "cache_read", "cache_write_5m", "cache_write_1h", "output"];

async function buildFrom(root: string) {
  const files = findCandidateFiles(root, WEEK_START);
  const { threads, sessions } = await normalize(files, { startMs: WEEK_START, endMs: WEEK_END });
  const table = loadPricing(PRICING_PATH, new Date("2026-09-28"));
  const turns = threads.flatMap((t) => t.turns);
  priceAllTurns(table, turns);
  fillSessionDollars(sessions, threads);
  return { threads, sessions, table };
}

describe("metrics", () => {
  test("sums reconcile to the cent across kinds, threads, and sessions", async () => {
    const root = makeTmpRoot("rs-cost-metrics-ok");
    writeJsonl(join(root, "proj1", "session-a.jsonl"), [
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
      assistantLine({
        messageId: "m2",
        timestamp: "2026-09-22T10:05:00.000Z",
        model: "claude-opus-5-5",
        usage: {
          input_tokens: 200_000,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 500,
        },
      }),
    ]);

    const { threads, sessions, table } = await buildFrom(root);
    const totals = computeTotals(threads);
    totals.sessions = sessions.length;
    const byKind = computeByKind(threads, table);
    const byThread = computeByThread(threads);

    expect(reconcile({ totals, byKind, sessions, byThread })).toBe(true);
  });

  test("a deliberately broken fixture fails reconciliation", async () => {
    const root = makeTmpRoot("rs-cost-metrics-broken");
    writeJsonl(join(root, "proj1", "session-b.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-haiku-4-5",
        usage: { input_tokens: 1_000_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
      }),
    ]);
    const { threads, sessions, table } = await buildFrom(root);
    const totals = computeTotals(threads);
    totals.sessions = sessions.length;
    const byKind = computeByKind(threads, table);
    const byThread = computeByThread(threads);

    // A real bug would desync one of the derived sums from the total.
    // Simulate that here to prove reconcile() catches it.
    const brokenByThread = { ...byThread, mainDollars: byThread.mainDollars + 50_000 };

    expect(reconcile({ totals, byKind, sessions, byThread: brokenByThread })).toBe(false);
  });

  test("context bins land on the right side of 150K", async () => {
    const root = makeTmpRoot("rs-cost-context-bins");
    writeJsonl(join(root, "proj1", "session-c.jsonl"), [
      assistantLine({
        messageId: "small",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: { input_tokens: 10_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
      }),
      assistantLine({
        messageId: "just-under",
        timestamp: "2026-09-22T10:05:00.000Z",
        model: "claude-sonnet-5",
        usage: { input_tokens: 149_999, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
      }),
      assistantLine({
        messageId: "just-over",
        timestamp: "2026-09-22T10:10:00.000Z",
        model: "claude-sonnet-5",
        usage: { input_tokens: 150_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
      }),
      assistantLine({
        messageId: "huge",
        timestamp: "2026-09-22T10:15:00.000Z",
        model: "claude-sonnet-5",
        usage: { input_tokens: 300_001, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
      }),
    ]);
    const { threads, table } = await buildFrom(root);
    const context = computeContext(threads, table);

    const byLabel = Object.fromEntries(context.bins.map((b) => [b.label, b.turns]));
    expect(byLabel.under_50k).toBe(1);
    expect(byLabel["50k_to_150k"]).toBe(1);
    expect(byLabel["150k_to_300k"]).toBe(1);
    expect(byLabel.over_300k).toBe(1);
  });

  test("by_kind covers every token kind", async () => {
    const root = makeTmpRoot("rs-cost-by-kind");
    writeJsonl(join(root, "proj1", "session-d.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: {
          input_tokens: 1_000,
          cache_read_input_tokens: 1_000,
          cache_creation: { ephemeral_5m_input_tokens: 500, ephemeral_1h_input_tokens: 500 },
          output_tokens: 1_000,
        },
      }),
    ]);
    const { threads, table } = await buildFrom(root);
    const byKind = computeByKind(threads, table);
    for (const kind of TOKEN_KINDS) {
      expect(byKind[kind].dollars).toBeGreaterThan(0);
    }
  });
});
