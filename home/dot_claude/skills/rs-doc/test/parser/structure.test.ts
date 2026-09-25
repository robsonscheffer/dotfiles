import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.ts";
import type { BlockquoteNode, HeadingNode, ListNode, TableNode } from "../../src/types.ts";

describe("headings", () => {
  test("heading ids are slugged and de-duplicated", () => {
    const doc = parse("# Orders\n\n## Orders\n", "headings.md");
    const [h1, h2] = doc.body as HeadingNode[];
    expect(h1?.id).toBe("orders");
    expect(h2?.id).toBe("orders-1");
    expect(doc.headings.map((h) => h.id)).toEqual(["orders", "orders-1"]);
  });
});

describe("lists", () => {
  test("an ordered list keeps its start number", () => {
    const doc = parse("3. third\n4. fourth\n", "ordered.md");
    const node = doc.body[0] as ListNode;
    expect(node.ordered).toBe(true);
    expect(node.start).toBe(3);
    expect(node.children).toHaveLength(2);
  });

  test("a bullet list has unordered items", () => {
    const doc = parse("- one\n- two\n", "bullet.md");
    const node = doc.body[0] as ListNode;
    expect(node.ordered).toBe(false);
    expect(node.children).toHaveLength(2);
  });
});

describe("blockquotes", () => {
  test("an Obsidian-style callout is extracted from the first paragraph", () => {
    const doc = parse("> [!warning] Contradicts an earlier note.\n", "callout.md");
    const node = doc.body[0] as BlockquoteNode;
    expect(node.type).toBe("blockquote");
    expect(node.callout).toBe("warning");
    const firstPara = node.children[0];
    if (firstPara?.type === "paragraph") {
      const text = firstPara.children[0];
      expect(text).toMatchObject({ type: "text", value: "Contradicts an earlier note." });
    }
  });

  test("a plain blockquote has no callout", () => {
    const doc = parse("> just a quote\n", "plain-quote.md");
    const node = doc.body[0] as BlockquoteNode;
    expect(node.callout).toBeUndefined();
  });
});

describe("tables", () => {
  test("alignment and cells are captured", () => {
    const src = "| Left | Right |\n| :-- | --: |\n| a | b |\n";
    const doc = parse(src, "table.md");
    const node = doc.body[0] as TableNode;
    expect(node.type).toBe("table");
    expect(node.align).toEqual(["left", "right"]);
    expect(node.head).toHaveLength(2);
    expect(node.rows).toHaveLength(1);
    expect(node.rows[0]).toHaveLength(2);
  });
});
