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

  test("nested directives (outer needs a longer marker run than any inner closer)", () => {
    const src = "::::steps\n:::note\ninner note\n:::\nouter text\n::::\n";
    const doc = parse(src, "nested.md");
    const outer = doc.body[0] as DirectiveNode;
    expect(outer.name).toBe("steps");
    expect(outer.children).toHaveLength(2);
    const inner = outer.children[0] as DirectiveNode;
    expect(inner.type).toBe("directive");
    expect(inner.name).toBe("note");
    expect(inner.children[0]?.type).toBe("paragraph");
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
