import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildReport } from "../src/report.ts";
import { parseIsoWeek } from "../src/date.ts";
import { assistantLine, makeTmpRoot, writeJsonl } from "./helpers.ts";
import type { Finding } from "../src/types.ts";

const PRICING_PATH = join(import.meta.dir, "..", "pricing.json");
const THRESHOLDS_PATH = join(import.meta.dir, "..", "thresholds.json");
const WEEK = parseIsoWeek("2026-W39", "UTC");

async function report(root: string) {
  const outDir = makeTmpRoot("rs-cost-rules-out");
  const { report: r } = await buildReport({
    root,
    week: WEEK,
    tz: "UTC",
    pricingPath: PRICING_PATH,
    thresholdsPath: THRESHOLDS_PATH,
    outDir,
    noRecord: true,
  });
  return r;
}

function findingFor(findings: Finding[], rule: string): Finding | undefined {
  return findings.find((f) => f.rule === rule);
}

const BIG = (promptTokens: number) => ({
  input_tokens: promptTokens,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  output_tokens: 100,
});

describe("R1 heavy context", () => {
  test("fires when a turn is over 150K", async () => {
    const root = makeTmpRoot("rs-cost-r1-fire");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(150_001) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R1")).toBeDefined();
    expect(findingFor(r.findings, "R1")!.confidence).toBe("lower_bound");
  });

  test("stays silent at exactly 150K", async () => {
    const root = makeTmpRoot("rs-cost-r1-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(150_000) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R1")).toBeUndefined();
  });
});

describe("R2 long-lived session", () => {
  test("fires when span exceeds 24 hours", async () => {
    const root = makeTmpRoot("rs-cost-r2-fire");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T00:00:00.000Z", model: "claude-sonnet-5", usage: BIG(100) }),
      assistantLine({ messageId: "m2", timestamp: "2026-09-23T00:00:01.000Z", model: "claude-sonnet-5", usage: BIG(100) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R2")).toBeDefined();
    expect(findingFor(r.findings, "R2")!.confidence).toBe("measured");
  });

  test("stays silent at exactly 24 hours and under 300 turns", async () => {
    const root = makeTmpRoot("rs-cost-r2-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T00:00:00.000Z", model: "claude-sonnet-5", usage: BIG(100) }),
      assistantLine({ messageId: "m2", timestamp: "2026-09-23T00:00:00.000Z", model: "claude-sonnet-5", usage: BIG(100) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R2")).toBeUndefined();
  });
});

describe("R3 heavy session with no helpers", () => {
  test("fires when peak context exceeds 200K with no subagent dollars", async () => {
    const root = makeTmpRoot("rs-cost-r3-fire");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(200_001) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R3")).toBeDefined();
  });

  test("stays silent at exactly 200K", async () => {
    const root = makeTmpRoot("rs-cost-r3-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(200_000) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R3")).toBeUndefined();
  });
});

function breakUsage(cacheWrite5m: number, cacheRead = 0) {
  return {
    input_tokens: 100,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheWrite5m,
    output_tokens: 100,
  };
}

describe("R4 idle expiry breaks", () => {
  test("fires with two or more idle-expiry breaks", async () => {
    const root = makeTmpRoot("rs-cost-r4-fire");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(200_000) }),
      assistantLine({ messageId: "m2", timestamp: "2026-09-22T10:06:01.000Z", model: "claude-sonnet-5", usage: breakUsage(20_000) }),
      assistantLine({ messageId: "m3", timestamp: "2026-09-22T11:00:00.000Z", model: "claude-sonnet-5", usage: BIG(200_000) }),
      assistantLine({ messageId: "m4", timestamp: "2026-09-22T11:06:01.000Z", model: "claude-sonnet-5", usage: breakUsage(20_000) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R4")).toBeDefined();
    expect(findingFor(r.findings, "R4")!.confidence).toBe("measured");
  });

  test("stays silent with only one idle-expiry break", async () => {
    const root = makeTmpRoot("rs-cost-r4-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(200_000) }),
      assistantLine({ messageId: "m2", timestamp: "2026-09-22T10:06:01.000Z", model: "claude-sonnet-5", usage: breakUsage(20_000) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R4")).toBeUndefined();
  });
});

describe("R5 model switch breaks", () => {
  test("fires with one model-switch break", async () => {
    const root = makeTmpRoot("rs-cost-r5-fire");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(200_000) }),
      assistantLine({ messageId: "m2", timestamp: "2026-09-22T10:00:30.000Z", model: "claude-opus-5-5", usage: breakUsage(20_000) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R5")).toBeDefined();
  });

  test("stays silent with no model switch", async () => {
    const root = makeTmpRoot("rs-cost-r5-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(100) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R5")).toBeUndefined();
  });
});

describe("R6 unknown breaks", () => {
  function threeUnknownBreaks() {
    return [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(200_000) }),
      assistantLine({ messageId: "m2", timestamp: "2026-09-22T10:00:10.000Z", model: "claude-sonnet-5", usage: breakUsage(20_000) }),
      assistantLine({ messageId: "m3", timestamp: "2026-09-22T10:01:00.000Z", model: "claude-sonnet-5", usage: BIG(200_000) }),
      assistantLine({ messageId: "m4", timestamp: "2026-09-22T10:01:10.000Z", model: "claude-sonnet-5", usage: breakUsage(20_000) }),
      assistantLine({ messageId: "m5", timestamp: "2026-09-22T10:02:00.000Z", model: "claude-sonnet-5", usage: BIG(200_000) }),
      assistantLine({ messageId: "m6", timestamp: "2026-09-22T10:02:10.000Z", model: "claude-sonnet-5", usage: breakUsage(20_000) }),
    ];
  }

  test("fires with three unknown breaks", async () => {
    const root = makeTmpRoot("rs-cost-r6-fire");
    writeJsonl(join(root, "proj", "s1.jsonl"), threeUnknownBreaks());
    const r = await report(root);
    expect(findingFor(r.findings, "R6")).toBeDefined();
  });

  test("stays silent with two unknown breaks", async () => {
    const root = makeTmpRoot("rs-cost-r6-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), threeUnknownBreaks().slice(0, 4));
    const r = await report(root);
    expect(findingFor(r.findings, "R6")).toBeUndefined();
  });
});

describe("R7 large images", () => {
  function fixture(growth: number) {
    return [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(10_000) }),
      {
        type: "user",
        timestamp: "2026-09-22T10:00:30.000Z",
        toolUseResult: { type: "image", file: { originalSize: 500_000 } },
        message: { content: [{ type: "tool_result", tool_use_id: "t1" }] },
      },
      assistantLine({ messageId: "m2", timestamp: "2026-09-22T10:01:00.000Z", model: "claude-sonnet-5", usage: BIG(10_000 + growth) }),
    ];
  }

  test("fires when prompt growth after an image exceeds 20K", async () => {
    const root = makeTmpRoot("rs-cost-r7-fire");
    writeJsonl(join(root, "proj", "s1.jsonl"), fixture(20_001));
    const r = await report(root);
    expect(findingFor(r.findings, "R7")).toBeDefined();
    expect(findingFor(r.findings, "R7")!.confidence).toBe("estimated");
  });

  test("stays silent at exactly 20K growth", async () => {
    const root = makeTmpRoot("rs-cost-r7-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), fixture(20_000));
    const r = await report(root);
    expect(findingFor(r.findings, "R7")).toBeUndefined();
  });
});

describe("R8 Opus on read-only work", () => {
  function fixture(thinkingTokens: number) {
    return [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-opus-5-5",
        usage: {
          input_tokens: 100_000,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 1_000,
          output_tokens_details: { thinking_tokens: thinkingTokens },
        },
      }),
    ];
  }

  test("fires on an Opus, no-edit-tool session with low thinking share", async () => {
    const root = makeTmpRoot("rs-cost-r8-fire");
    writeJsonl(join(root, "proj", "s1.jsonl"), fixture(50));
    const r = await report(root);
    expect(findingFor(r.findings, "R8")).toBeDefined();
    expect(findingFor(r.findings, "R8")!.confidence).toBe("estimated");
  });

  test("stays silent once thinking share reaches the threshold", async () => {
    const root = makeTmpRoot("rs-cost-r8-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), fixture(100));
    const r = await report(root);
    expect(findingFor(r.findings, "R8")).toBeUndefined();
  });

  test("stays silent when an edit tool was used", async () => {
    const root = makeTmpRoot("rs-cost-r8-edit-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-opus-5-5",
        usage: { input_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1_000 },
        content: [{ type: "tool_use", name: "Edit", input: { file_path: "/tmp/a.ts" } }],
      }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R8")).toBeUndefined();
  });
});

describe("R10 small stuff", () => {
  test("fires on a premium subagent with no pinned model", async () => {
    const root = makeTmpRoot("rs-cost-r10-fire");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(100) }),
    ]);
    writeJsonl(join(root, "proj", "subagents", "agent-a1.jsonl"), [
      assistantLine({ messageId: "sa1", timestamp: "2026-09-22T10:01:00.000Z", model: "claude-opus-5-5", usage: BIG(1_000) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R10")).toBeDefined();
    expect(findingFor(r.findings, "R10")!.confidence).toBe("measured");
  });

  test("stays silent with no subagents", async () => {
    const root = makeTmpRoot("rs-cost-r10-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), [
      assistantLine({ messageId: "m1", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: BIG(100) }),
    ]);
    const r = await report(root);
    expect(findingFor(r.findings, "R10")).toBeUndefined();
  });
});

describe("R11 1-hour cache lifetime", () => {
  function fixture(oneHourTokens: number) {
    return [
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        usage: { input_tokens: 100, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: oneHourTokens }, output_tokens: 100 },
      }),
      assistantLine({
        messageId: "m2",
        timestamp: "2026-09-22T10:02:00.000Z",
        model: "claude-sonnet-5",
        usage: { input_tokens: 100, cache_read_input_tokens: oneHourTokens, cache_creation_input_tokens: 0, output_tokens: 100 },
      }),
    ];
  }

  test("fires when the net cost of the week's 1h writes exceeds the threshold", async () => {
    const root = makeTmpRoot("rs-cost-r11-fire");
    writeJsonl(join(root, "proj", "s1.jsonl"), fixture(1_000_000));
    const r = await report(root);
    expect(findingFor(r.findings, "R11")).toBeDefined();
    expect(findingFor(r.findings, "R11")!.confidence).toBe("estimated");
  });

  test("stays silent for a small 1h write", async () => {
    const root = makeTmpRoot("rs-cost-r11-silent");
    writeJsonl(join(root, "proj", "s1.jsonl"), fixture(100));
    const r = await report(root);
    expect(findingFor(r.findings, "R11")).toBeUndefined();
  });
});

test("findings sort measured and lower_bound together by dollars, then estimated by dollars", async () => {
  const root = makeTmpRoot("rs-cost-sort-order");
  writeJsonl(join(root, "proj", "s1.jsonl"), [
    assistantLine({ messageId: "m1", timestamp: "2026-09-22T00:00:00.000Z", model: "claude-sonnet-5", usage: BIG(200_001) }),
    assistantLine({ messageId: "m2", timestamp: "2026-09-23T00:00:01.000Z", model: "claude-sonnet-5", usage: BIG(100) }),
  ]);
  const r = await report(root);
  const groups: Record<string, number> = { measured: 0, lower_bound: 0, estimated: 1 };
  for (let i = 1; i < r.findings.length; i += 1) {
    const prevGroup = groups[r.findings[i - 1]!.confidence]!;
    const currGroup = groups[r.findings[i]!.confidence]!;
    expect(currGroup).toBeGreaterThanOrEqual(prevGroup);
    if (currGroup === prevGroup) {
      expect(r.findings[i - 1]!.dollars).toBeGreaterThanOrEqual(r.findings[i]!.dollars);
    }
  }
});
