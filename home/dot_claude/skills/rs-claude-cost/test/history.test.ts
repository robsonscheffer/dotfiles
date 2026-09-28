import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildSinceLastWeek, findingsPath, historyPath, recordWeek } from "../src/history.ts";
import { makeTmpRoot } from "./helpers.ts";
import type { Finding, Totals } from "../src/types.ts";

function totals(dollars: number): Totals {
  return { dollars, requests: 1, turns: 1, sessions: 1, tokens: { input: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, output: 0 } };
}

function finding(rule: string, dollars: number): Finding {
  return { rule, title: `${rule} title`, dollars, confidence: "measured", sessionIds: [], action: "do it", resumeCommand: "" };
}

describe("history", () => {
  test("running a week twice leaves one set of rows", () => {
    const outDir = makeTmpRoot("rs-cost-history-rerun");
    recordWeek(outDir, "2026-W39", totals(1_000_000), [finding("R1", 100_000)]);
    recordWeek(outDir, "2026-W39", totals(2_000_000), [finding("R1", 200_000), finding("R2", 50_000)]);

    const history = readFileSync(historyPath(outDir), "utf8").trim().split("\n");
    expect(history).toHaveLength(1);
    expect(JSON.parse(history[0]!).totalDollars).toBe(2_000_000);

    const findings = readFileSync(findingsPath(outDir), "utf8").trim().split("\n");
    expect(findings).toHaveLength(2);
  });

  test("a second week shows then-now pairs with the right direction", () => {
    const outDir = makeTmpRoot("rs-cost-history-pairs");
    recordWeek(outDir, "2026-W39", totals(1_000_000), [finding("R1", 100_000), finding("R2", 50_000)]);

    const currentFindings = [finding("R1", 150_000)]; // R1 up, R2 dropped to 0
    const rows = buildSinceLastWeek(outDir, "2026-W40", "UTC", currentFindings);

    const r1 = rows.find((r) => r.rule === "R1")!;
    expect(r1.metricThen).toBe(100_000);
    expect(r1.metricNow).toBe(150_000);
    expect(r1.direction).toBe("up");

    const r2 = rows.find((r) => r.rule === "R2")!;
    expect(r2.metricThen).toBe(50_000);
    expect(r2.metricNow).toBe(0);
    expect(r2.direction).toBe("down");
  });

  test("no rows when nothing fired the previous week", () => {
    const outDir = makeTmpRoot("rs-cost-history-empty");
    const rows = buildSinceLastWeek(outDir, "2026-W40", "UTC", []);
    expect(rows).toHaveLength(0);
  });
});
