import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.ts";
import type { DirectiveNode, ErrorNode } from "../../src/types.ts";

describe("directives", () => {
  test("a known directive parses its args and children as markdown", () => {
    const src = ":::collide participant_id\nThey collide on this field.\n:::\n";
    const doc = parse(src, "collide.md");
    const node = doc.body[0] as DirectiveNode;
    expect(node.type).toBe("directive");
    expect(node.name).toBe("collide");
    expect(node.known).toBe(true);
    expect(node.args).toEqual(["participant_id"]);
    expect(node.children).toHaveLength(1);
    expect(node.children[0]?.type).toBe("paragraph");
  });

  test("an unknown directive name is a directive node, not an error", () => {
    const src = ":::mystery foo\nbody text\n:::\n";
    const doc = parse(src, "unknown.md");
    const node = doc.body[0] as DirectiveNode;
    expect(node.type).toBe("directive");
    expect(node.name).toBe("mystery");
    expect(node.known).toBe(false);
  });

  test("flow keeps its body as raw lines, not parsed markdown", () => {
    const src = ":::flow\nstep one -> step two\n**not emphasis**\n:::\n";
    const doc = parse(src, "flow.md");
    const node = doc.body[0] as DirectiveNode;
    expect(node.name).toBe("flow");
    expect(node.children).toEqual([]);
    expect(node.raw).toEqual(["step one -> step two", "**not emphasis**"]);
  });

  test("tiles keeps its body as raw lines too", () => {
    const src = ":::tiles\ntile a | tile b\n:::\n";
    const doc = parse(src, "tiles.md");
    const node = doc.body[0] as DirectiveNode;
    expect(node.name).toBe("tiles");
    expect(node.raw).toEqual(["tile a | tile b"]);
  });

  test("nested directives, same marker length throughout, close by depth", () => {
    const src = ":::steps\nFirst.\n\n:::note\nInner.\n:::\n\nAfter inner.\n:::\n";
    const doc = parse(src, "nested.md");
    const outer = doc.body[0] as DirectiveNode;
    expect(outer.type).toBe("directive");
    expect(outer.name).toBe("steps");
    // First paragraph, the note directive, and the "After inner." paragraph.
    expect(outer.children).toHaveLength(3);
    expect(outer.children[0]?.type).toBe("paragraph");
    const inner = outer.children[1] as DirectiveNode;
    expect(inner.type).toBe("directive");
    expect(inner.name).toBe("note");
    expect(inner.children[0]?.type).toBe("paragraph");
    const after = outer.children[2];
    expect(after?.type).toBe("paragraph");
    if (after?.type === "paragraph") {
      expect(after.children[0]).toMatchObject({ type: "text", value: "After inner." });
    }
  });

  test("three levels deep, all bare ::: markers, close by depth", () => {
    const src = ":::a\n:::b\n:::c\nx\n:::\n:::\n:::\n";
    const doc = parse(src, "deep-nesting.md");
    const a = doc.body[0] as DirectiveNode;
    expect(a.name).toBe("a");
    const b = a.children[0] as DirectiveNode;
    expect(b.name).toBe("b");
    const c = b.children[0] as DirectiveNode;
    expect(c.name).toBe("c");
    expect(c.children[0]?.type).toBe("paragraph");
    expect(doc.errors).toHaveLength(0);
  });

  test("mixed marker lengths still nest correctly by depth, not by length", () => {
    const src = "::::outer\n:::inner\nbody\n:::\n::::\n";
    const doc = parse(src, "mixed-lengths.md");
    const outer = doc.body[0] as DirectiveNode;
    expect(outer.name).toBe("outer");
    expect(outer.children).toHaveLength(1);
    const inner = outer.children[0] as DirectiveNode;
    expect(inner.name).toBe("inner");
    expect(doc.errors).toHaveLength(0);
  });

  test("a stray closing fence with no open directive is an error node with position", () => {
    const src = "intro text\n\n:::\n\nmore text\n";
    const doc = parse(src, "stray-close.md");
    const errorNode = doc.body.find((b) => b.type === "error") as ErrorNode | undefined;
    expect(errorNode).toBeDefined();
    expect(errorNode?.message).toBe("closing fence ::: has no open directive");
    expect(errorNode?.pos.start.line).toBe(3);
    expect(doc.errors).toHaveLength(1);
    // Text before and after the stray closer still parses as ordinary paragraphs.
    expect(doc.body.filter((b) => b.type === "paragraph")).toHaveLength(2);
  });

  test("a ::: inside a fenced code block within a directive is content, not a marker", () => {
    const src = ":::note\nSee this:\n\n```\n:::\n```\n\nStill inside.\n:::\n";
    const doc = parse(src, "code-fence-inside.md");
    const node = doc.body[0] as DirectiveNode;
    expect(node.type).toBe("directive");
    expect(node.name).toBe("note");
    expect(doc.errors).toHaveLength(0);
    const code = node.children.find((c) => c.type === "code");
    expect(code).toBeDefined();
    if (code?.type === "code") expect(code.value).toBe(":::\n");
    const lastPara = node.children[node.children.length - 1];
    expect(lastPara?.type).toBe("paragraph");
    if (lastPara?.type === "paragraph") {
      expect(lastPara.children[0]).toMatchObject({ type: "text", value: "Still inside." });
    }
  });

  test("a directive with no closing fence becomes an error node with position", () => {
    const src = "intro\n\n:::warn\nthis never closes\n";
    const doc = parse(src, "unclosed.md");
    const errorNode = doc.body.find((b) => b.type === "error") as ErrorNode | undefined;
    expect(errorNode).toBeDefined();
    expect(errorNode?.message).toBe("directive :::warn is never closed");
    expect(errorNode?.pos.start.line).toBe(3);
    expect(doc.errors).toHaveLength(1);
    expect(doc.errors[0]).toBe(errorNode);
  });
});
