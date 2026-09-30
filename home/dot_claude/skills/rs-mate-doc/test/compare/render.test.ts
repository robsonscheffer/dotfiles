import { describe, expect, test } from "bun:test";
import { loadLedger } from "../../src/ledger/index.ts";
import { lint } from "../../src/lint/index.ts";
import { parse } from "../../src/parser/index.ts";
import {
  composeCompare,
  composeSetIndex,
  wordCount,
  type CompareRun,
  type PaneRun,
} from "../../src/compare/render.ts";
import type { CheckSpec } from "../../src/compare/types.ts";

describe("wordCount", () => {
  test("counts words separated by any whitespace", () => {
    expect(wordCount("one two\tthree\nfour")).toBe(4);
  });

  test("empty text is zero words", () => {
    expect(wordCount("   ")).toBe(0);
  });
});

const checks: CheckSpec[] = [{ name: "words", kind: "words" }];

function pane(text: string, words: number, over: Partial<PaneRun> = {}): PaneRun {
  return { text, checks: [{ name: "words", value: words }], seconds: 3, context: 100, output: 20, cost: 0.02, ...over };
}

function run(a: PaneRun, base: PaneRun, b: PaneRun): CompareRun {
  return { A: a, "A-base": base, B: b };
}

function input(runs: CompareRun[]) {
  return {
    promptFile: "prompt.md",
    prompt: "Explain the refund policy.",
    basePath: "rules/base.md",
    baseHash: "deadbeef",
    bPath: "rules/candidate.md",
    bHash: "cafef00d",
    checks,
    runs,
  };
}

describe("composeCompare", () => {
  test("index.md shows the prompt, both system files with hashes, and tabs per run", () => {
    const result = composeCompare(input([run(pane("a", 1), pane("base", 1), pane("b", 1))]));
    const index = result.files["index.md"]!;
    expect(Object.keys(result.files)).toEqual(["index.md"]);
    expect(index).toContain("Explain the refund policy.");
    expect(index).toContain("rules/base.md");
    expect(index).toContain("deadbeef");
    expect(index).toContain("rules/candidate.md");
    expect(index).toContain("cafef00d");
    expect(index).toContain(":::tabs");
    expect(index).toContain("## A\n");
    expect(index).toContain("## A-base\n");
    expect(index).toContain("## B\n");
    expect(index).toContain("Your verdict:");
  });

  test("a single run shows values only and the verdict is single run", () => {
    const result = composeCompare(input([run(pane("a", 10), pane("base", 20), pane("b", 5))]));
    const index = result.files["index.md"]!;
    expect(index).toContain("| words | 10 | 20 | 5 | single run |");
    expect(index).toContain("| seconds | 3 | 3 | 3 | - |");
    expect(index).toContain("| cost | $0.0200 | $0.0200 | $0.0200 | - |");
    expect(result.verdicts).toEqual([{ check: "words", verdict: "single run" }]);
  });

  test("median and range cells, and B better when ranges do not overlap", () => {
    const result = composeCompare(
      input([
        run(pane("a", 30), pane("base", 40), pane("b", 10)),
        run(pane("a", 34), pane("base", 44), pane("b", 12)),
      ]),
    );
    const index = result.files["index.md"]!;
    expect(index).toContain("| words | 32 [30..34] | 42 [40..44] | 11 [10..12] | B better |");
    expect(result.verdicts[0]!.verdict).toBe("B better");
  });

  test("overlapping ranges are the same", () => {
    const result = composeCompare(
      input([
        run(pane("a", 30), pane("base", 40), pane("b", 38)),
        run(pane("a", 34), pane("base", 44), pane("b", 42)),
      ]),
    );
    expect(result.verdicts[0]!.verdict).toBe("same");
  });

  test("null metrics render n/a", () => {
    const p = pane("x", 1, { context: null, output: null });
    const index = composeCompare(input([run(p, p, p)])).files["index.md"]!;
    expect(index).toContain("| context | n/a | n/a | n/a | - |");
  });

  test("agent output containing directive-shaped and heading-shaped lines does not break the doc", () => {
    const hostile = "## Fake heading\n\n:::note\nnested\n:::\n\n:::\n";
    const result = composeCompare(input([run(pane(hostile, 3), pane("safe", 1), pane("safe", 1))]));
    const doc = parse(result.files["index.md"]!, "index.md");
    expect(doc.errors).toEqual([]);
  });

  test("index.md passes mate-doc lint, with and without a ledger", async () => {
    const result = composeCompare(
      input([
        run(pane("a", 3), pane("base", 4), pane("b", 2)),
        run(pane("a", 3), pane("base", 4), pane("b", 2)),
      ]),
    );
    const doc = parse(result.files["index.md"]!, "index.md");
    expect(lint([doc], null).filter((i) => i.severity === "error")).toEqual([]);
    const ledger = await loadLedger("/does/not/exist");
    expect(lint([doc], ledger).filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("composeSetIndex", () => {
  test("links each prompt folder with its verdict row", () => {
    const index = composeSetIndex([
      { name: "alpha", verdicts: [{ check: "words", verdict: "B better" }] },
      { name: "beta", verdicts: [{ check: "words", verdict: "same" }] },
    ]);
    expect(index).toContain("| [alpha](alpha/index.md) | words: B better |");
    expect(index).toContain("| [beta](beta/index.md) | words: same |");
    const doc = parse(index, "index.md");
    expect(doc.errors).toEqual([]);
  });
});
