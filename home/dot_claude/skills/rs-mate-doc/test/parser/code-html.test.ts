import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.ts";
import type { CodeBlockNode, HtmlBlockNode } from "../../src/types.ts";

describe("fenced code", () => {
  test("a fence with just a lang keeps the info string", () => {
    const doc = parse("```diff\n- old\n+ new\n```\n", "diff.md");
    const node = doc.body[0] as CodeBlockNode;
    expect(node.type).toBe("code");
    expect(node.lang).toBe("diff");
    expect(node.meta).toEqual({});
    expect(node.value).toBe("- old\n+ new\n");
  });

  test("a fence with lang and meta key=value pairs", () => {
    const doc = parse('```ts title=x.ts\nexport const x = 1;\n```\n', "meta.md");
    const node = doc.body[0] as CodeBlockNode;
    expect(node.lang).toBe("ts");
    expect(node.meta).toEqual({ title: "x.ts" });
  });

  test("code content is kept verbatim, including a claim ref pattern", () => {
    const doc = parse("```\nconst id = '{C7}';\n```\n", "verbatim.md");
    const node = doc.body[0] as CodeBlockNode;
    expect(node.value).toContain("{C7}");
  });

  test("an indented code block has no lang", () => {
    const doc = parse("    plain code\n", "indented.md");
    const node = doc.body[0] as CodeBlockNode;
    expect(node.type).toBe("code");
    expect(node.lang).toBeUndefined();
  });
});

describe("raw html", () => {
  test("a raw html block passes through verbatim", () => {
    const doc = parse("<div class=\"box\">\n  <p>hi</p>\n</div>\n", "html-block.md");
    const node = doc.body[0] as HtmlBlockNode;
    expect(node.type).toBe("html");
    expect(node.value).toContain('<div class="box">');
  });

  test("raw inline html passes through verbatim", () => {
    const doc = parse("Text with <span class=\"x\">inline</span> html.\n", "html-inline.md");
    const para = doc.body[0];
    if (para?.type === "paragraph") {
      const html = para.children.find((c) => c.type === "htmlInline");
      expect(html).toBeDefined();
      if (html?.type === "htmlInline") expect(html.value).toBe('<span class="x">');
    }
  });
});
