import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { renderSession } from "../src/session.ts";
import { assistantLine, makeTmpRoot, writeJsonl } from "./helpers.ts";

const PRICING = join(import.meta.dir, "..", "pricing.json");

describe("session command", () => {
  test("prints one line per turn and flags an idle break", async () => {
    const root = makeTmpRoot("rs-cost-session");
    const big = { input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 10, cache_creation_input_tokens: 40_000, cache_creation: { ephemeral_5m_input_tokens: 40_000, ephemeral_1h_input_tokens: 0 } };
    writeJsonl(join(root, "proj", "sess-1.jsonl"), [
      assistantLine({ messageId: "a", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: big }),
      assistantLine({ messageId: "b", timestamp: "2026-09-22T11:00:00.000Z", model: "claude-sonnet-5", usage: big }),
    ]);

    const lines = await renderSession("sess-1", { root, pricingPath: PRICING });

    expect(lines).not.toBeNull();
    expect(lines![0]).toContain("2 turns");
    expect(lines!.filter((l) => /^\s+\d+\s/.test(l))).toHaveLength(2);
    expect(lines![3]).toContain("break: idle expiry");
  });

  test("an unknown id returns null", async () => {
    const root = makeTmpRoot("rs-cost-session-missing");
    writeJsonl(join(root, "proj", "other.jsonl"), [
      assistantLine({ messageId: "a", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5" }),
    ]);
    expect(await renderSession("sess-1", { root, pricingPath: PRICING })).toBeNull();
  });
});
