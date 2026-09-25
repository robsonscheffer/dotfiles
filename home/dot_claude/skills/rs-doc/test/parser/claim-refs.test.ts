import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.ts";

describe("claim refs", () => {
  test("parses an inline claim ref into a claimRef node", () => {
    const doc = parse("Orders ship same day {C7}.\n", "claims.md");
    expect(doc.claimRefs).toHaveLength(1);
    expect(doc.claimRefs[0]?.id).toBe("C7");
    const para = doc.body[0];
    expect(para?.type).toBe("paragraph");
    if (para?.type === "paragraph") {
      const ref = para.children.find((c) => c.type === "claimRef");
      expect(ref).toBeDefined();
    }
  });

  test("a claim ref inside inline code stays plain text", () => {
    const doc = parse("Use `{C7}` as the literal marker.\n", "claims-code.md");
    expect(doc.claimRefs).toHaveLength(0);
    const para = doc.body[0];
    if (para?.type === "paragraph") {
      const code = para.children.find((c) => c.type === "inlineCode");
      expect(code?.type).toBe("inlineCode");
      if (code?.type === "inlineCode") expect(code.value).toBe("{C7}");
    }
  });

  test("a claim ref inside a fenced code block stays plain text", () => {
    const doc = parse("```\n{C7}\n```\n", "claims-fence.md");
    expect(doc.claimRefs).toHaveLength(0);
    expect(doc.body[0]?.type).toBe("code");
  });

  test("multiple claim refs are all collected", () => {
    const doc = parse("First {C1} and second {C22}.\n", "claims-multi.md");
    expect(doc.claimRefs.map((c) => c.id)).toEqual(["C1", "C22"]);
  });
});
