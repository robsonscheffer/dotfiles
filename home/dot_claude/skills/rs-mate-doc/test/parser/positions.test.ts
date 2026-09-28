import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.ts";
import type { ParagraphNode } from "../../src/types.ts";

describe("source positions", () => {
  test("a top-level heading starts at line 1, column 1", () => {
    const doc = parse("# Title\n", "pos-heading.md");
    expect(doc.body[0]?.pos.start).toEqual({ line: 1, column: 1 });
  });

  test("a paragraph on line 3 reports the right line", () => {
    const doc = parse("# Title\n\nSecond paragraph.\n", "pos-para.md");
    const para = doc.body[1];
    expect(para?.pos.start.line).toBe(3);
  });

  test("a claim ref column reflects its offset within the line", () => {
    const doc = parse("abc {C7} def\n", "pos-claim.md");
    const para = doc.body[0] as ParagraphNode;
    const ref = para.children.find((c) => c.type === "claimRef");
    // "abc " is 4 characters, so the { starts at column 5.
    expect(ref?.pos.start).toEqual({ line: 1, column: 5 });
  });

  test("a claim ref on a wrapped second line advances the line number", () => {
    const doc = parse("first line\nsecond line has {C3} in it\n", "pos-wrap.md");
    const para = doc.body[0] as ParagraphNode;
    const ref = para.children.find((c) => c.type === "claimRef");
    expect(ref?.pos.start.line).toBe(2);
  });
});
