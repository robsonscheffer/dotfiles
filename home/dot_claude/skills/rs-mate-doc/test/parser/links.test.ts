import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.ts";
import type { LinkNode, ParagraphNode } from "../../src/types.ts";

function firstLink(src: string, path: string): LinkNode {
  const doc = parse(src, path);
  const para = doc.body[0] as ParagraphNode;
  const link = para.children.find((c) => c.type === "link");
  if (!link || link.type !== "link") throw new Error("no link found");
  return link;
}

describe("links", () => {
  test("a relative .md link gets kind md", () => {
    const link = firstLink("See [checkout](../checkout/flow.md) for details.\n", "md-link.md");
    expect(link.kind).toBe("md");
    expect(link.target).toBe("../checkout/flow.md");
  });

  test("a relative .md link with an anchor still gets kind md", () => {
    const link = firstLink("See [step](flow.md#step-2).\n", "md-anchor.md");
    expect(link.kind).toBe("md");
    expect(link.target).toBe("flow.md#step-2");
  });

  test("a bare anchor link gets kind anchor", () => {
    const link = firstLink("Jump to [step two](#step-two).\n", "anchor.md");
    expect(link.kind).toBe("anchor");
    expect(link.target).toBe("#step-two");
  });

  test("an external url gets kind url", () => {
    const link = firstLink("Read [the docs](https://example.com/orders).\n", "url.md");
    expect(link.kind).toBe("url");
    expect(link.target).toBe("https://example.com/orders");
  });

  test("a wikilink with no label uses the target as the label", () => {
    const link = firstLink("See [[Orders Overview]] for context.\n", "wiki-plain.md");
    expect(link.kind).toBe("wiki");
    expect(link.target).toBe("Orders Overview");
    expect(link.children).toHaveLength(1);
    expect(link.children[0]).toMatchObject({ type: "text", value: "Orders Overview" });
  });

  test("a wikilink with a label keeps target and label separate", () => {
    const link = firstLink("See [[Orders Overview|the overview]] for context.\n", "wiki-label.md");
    expect(link.kind).toBe("wiki");
    expect(link.target).toBe("Orders Overview");
    expect(link.children[0]).toMatchObject({ type: "text", value: "the overview" });
  });
});
