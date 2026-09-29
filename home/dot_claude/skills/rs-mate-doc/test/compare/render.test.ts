import { describe, expect, test } from "bun:test";
import { loadLedger } from "../../src/ledger/index.ts";
import { lint } from "../../src/lint/index.ts";
import { parse } from "../../src/parser/index.ts";
import { composeCompare, wordCount } from "../../src/compare/render.ts";

describe("wordCount", () => {
  test("counts words separated by any whitespace", () => {
    expect(wordCount("one two\tthree\nfour")).toBe(4);
  });

  test("empty text is zero words", () => {
    expect(wordCount("   ")).toBe(0);
  });
});

describe("composeCompare", () => {
  function basicInput(runs: { without: string; with: string }[]) {
    return {
      promptFile: "prompt.md",
      prompt: "Explain the refund policy.",
      corePath: "/config/AGENTS.md",
      coreHash: "deadbeef",
      runs,
    };
  }

  test("single run writes without.md and with.md, unnumbered", () => {
    const result = composeCompare(basicInput([{ without: "plain answer", with: "core answer" }]));
    expect(Object.keys(result.files).sort()).toEqual(["index.md", "with.md", "without.md"]);
    expect(result.files["without.md"]).toBe("plain answer");
    expect(result.files["with.md"]).toBe("core answer");
  });

  test("multiple runs are numbered", () => {
    const result = composeCompare(
      basicInput([
        { without: "a1", with: "a2" },
        { without: "b1", with: "b2" },
      ]),
    );
    expect(Object.keys(result.files).sort()).toEqual([
      "index.md",
      "with-1.md",
      "with-2.md",
      "without-1.md",
      "without-2.md",
    ]);
  });

  test("index.md shows the prompt, core path and hash, and word counts", () => {
    const result = composeCompare(basicInput([{ without: "one two", with: "one two three" }]));
    const index = result.files["index.md"]!;
    expect(index).toContain("Explain the refund policy.");
    expect(index).toContain("/config/AGENTS.md");
    expect(index).toContain("deadbeef");
    expect(index).toContain("Without core: 2 words");
    expect(index).toContain("With core: 3 words");
    expect(index).toContain(":::tabs");
    expect(index).toContain("## Without core");
    expect(index).toContain("## With core");
  });

  test("agent output containing directive-shaped and heading-shaped lines does not break the doc", () => {
    const hostile = "## Fake heading\n\n:::note\nnested\n:::\n\n:::\n";
    const result = composeCompare(basicInput([{ without: hostile, with: "safe" }]));
    const index = result.files["index.md"]!;
    const doc = parse(index, "index.md");
    expect(doc.errors).toEqual([]);
  });

  test("index.md passes mate-doc lint", () => {
    const result = composeCompare(basicInput([{ without: "plain answer", with: "core answer" }]));
    const doc = parse(result.files["index.md"]!, "index.md");
    const issues = lint([doc], null);
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  test("index.md with a ledger present still lints clean (no claims referenced)", async () => {
    const result = composeCompare(basicInput([{ without: "plain answer", with: "core answer" }]));
    const doc = parse(result.files["index.md"]!, "index.md");
    const ledger = await loadLedger("/does/not/exist");
    const issues = lint([doc], ledger);
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
});
