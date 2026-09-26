import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.ts";

describe("frontmatter", () => {
  test("parses known keys and keeps unknown keys in extra", () => {
    const src = `---
title: Orders overview
type: guide
tags:
  - orders
  - checkout
created: 2026-01-05
homemade: true
---

# Heading
`;
    const doc = parse(src, "orders.md");
    expect(doc.frontmatter.title).toBe("Orders overview");
    expect(doc.frontmatter.type).toBe("guide");
    expect(doc.frontmatter.tags).toEqual(["orders", "checkout"]);
    expect(doc.frontmatter.created).toBe("2026-01-05");
    expect(typeof doc.frontmatter.created).toBe("string");
    expect(doc.frontmatter.extra.homemade).toBe(true);
  });

  test("a file with only frontmatter has an empty body", () => {
    const src = `---
title: Just frontmatter
---
`;
    const doc = parse(src, "only-fm.md");
    expect(doc.frontmatter.title).toBe("Just frontmatter");
    expect(doc.body).toEqual([]);
  });

  test("an empty file has empty frontmatter and empty body", () => {
    const doc = parse("", "empty.md");
    expect(doc.frontmatter.extra).toEqual({});
    expect(doc.body).toEqual([]);
  });

  test("body line numbers account for the frontmatter offset", () => {
    const src = `---
title: X
---

# Heading
`;
    const doc = parse(src, "offset.md");
    const heading = doc.body[0];
    expect(heading?.type).toBe("heading");
    // line 1: ---, line2: title, line3: ---, line4: blank, line5: heading
    expect(heading?.pos.start.line).toBe(5);
  });
});
