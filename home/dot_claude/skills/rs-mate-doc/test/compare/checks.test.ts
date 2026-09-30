import { describe, expect, test } from "bun:test";
import { runChecks } from "../../src/compare/checks";

const one = (text: string, spec: Parameters<typeof runChecks>[1][number]) => runChecks(text, [spec])[0]!;

describe("runChecks", () => {
  test("words counts whitespace-separated words and ignores max", () => {
    const r = one("one two\nthree   four", { name: "w", kind: "words", max: 2 });
    expect(r).toEqual({ name: "w", value: 4 });
  });

  test("count matches an em-dash", () => {
    expect(one("a — b — c", { name: "d", kind: "count", pattern: "—" }).value).toBe(2);
  });

  test("count returns -1 for an invalid pattern", () => {
    expect(one("abc", { name: "bad", kind: "count", pattern: "(" }).value).toBe(-1);
  });

  test("phrases counts case-insensitively across the list", () => {
    const r = one("Honestly, HONESTLY. In fact, honestly.", {
      name: "p",
      kind: "phrases",
      list: ["honestly", "in fact"],
    });
    expect(r.value).toBe(4);
  });

  test("long_paragraphs counts paragraphs over the line limit", () => {
    const text = "a\nb\nc\n\nd\ne\n\nf";
    expect(one(text, { name: "l", kind: "long_paragraphs", max_lines: 2 }).value).toBe(1);
  });

  test("long_paragraphs ignores fenced code blocks", () => {
    const text = "intro\n\n```\n1\n2\n3\n4\n```\n\nouter";
    expect(one(text, { name: "l", kind: "long_paragraphs", max_lines: 2 }).value).toBe(0);
  });

  test("ends_with is 1 when the last paragraph matches", () => {
    const text = "first\n\nWhich option do you want?\n\n";
    expect(one(text, { name: "e", kind: "ends_with", pattern: "\\?$" }).value).toBe(1);
  });

  test("ends_with is 0 when the last paragraph does not match", () => {
    const text = "Is this right?\n\nDone.";
    expect(one(text, { name: "e", kind: "ends_with", pattern: "\\?$" }).value).toBe(0);
  });

  test("returns one value per spec in order", () => {
    const r = runChecks("x y", [
      { name: "a", kind: "words" },
      { name: "b", kind: "count", pattern: "x" },
    ]);
    expect(r.map((v) => v.name)).toEqual(["a", "b"]);
  });
});
