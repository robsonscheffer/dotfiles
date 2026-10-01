// Regression coverage for the excerpt/anchor mismatch: a modify hunk's first changed line is
// almost always the removed line, but that line only exists at the PR's base commit, not the
// head commit compose.ts anchors every code claim to. findAnchorLine has to say which image
// (added -> head, removed -> base) its excerpt belongs to.
import { describe, expect, test } from "bun:test";
import { findAnchorLine, renderDiffFence } from "../../src/walk/diff.ts";

const MODIFY_DIFF = [
  "diff --git a/src/widget.ts b/src/widget.ts",
  "index 8f2a1c4..b93e017 100644",
  "--- a/src/widget.ts",
  "+++ b/src/widget.ts",
  "@@ -10,3 +10,3 @@",
  " export function widget() {",
  "-  return 'old label';",
  "+  return 'new label';",
  " }",
  "",
].join("\n");

const PURE_REMOVAL_DIFF = [
  "diff --git a/src/legacy.ts b/src/legacy.ts",
  "index 8f2a1c4..b93e017 100644",
  "--- a/src/legacy.ts",
  "+++ b/src/legacy.ts",
  "@@ -10,2 +9,0 @@",
  "-export const UNUSED_FLAG = false;",
  "-",
  "",
].join("\n");

const NO_CHANGE_DIFF = ["diff --git a/src/other.ts b/src/other.ts", "index 8f2a1c4..b93e017 100644", "--- a/src/other.ts", "+++ b/src/other.ts", ""].join("\n");

const SEARCH_DIFF = [
  "diff --git a/src/search.ts b/src/search.ts",
  "index 8f2a1c4..b93e017 100644",
  "--- a/src/search.ts",
  "+++ b/src/search.ts",
  "@@ -10,5 +10,6 @@",
  " import a from 'a';",
  "-import old from 'old';",
  "+import fresh from 'fresh';",
  " const x = 1;",
  " const y = 2;",
  "+export const target = compute(x, y);",
  "",
].join("\n");

describe("findAnchorLine", () => {
  test("counts lines past earlier hunk content, so a later match gets the right number", () => {
    const change = findAnchorLine(SEARCH_DIFF, "src/search.ts", "export const target = compute(x, y);");
    expect(change).toEqual({ found: true, excerpt: "export const target = compute(x, y);", line: 14, side: "added" });
  });

  test("an added match after a removed line counts newLine correctly", () => {
    const change = findAnchorLine(SEARCH_DIFF, "src/search.ts", "import fresh");
    expect(change.line).toBe(11);
    expect(change.excerpt).toBe("import fresh");
  });

  test("a removed-only match is anchored on the old-file line", () => {
    const change = findAnchorLine(SEARCH_DIFF, "src/search.ts", "  import old from 'old';  ");
    expect(change).toEqual({ found: true, excerpt: "import old from 'old';", line: 11, side: "removed" });
  });

  test("added lines win over removed lines that also match", () => {
    const diff = [
      "diff --git a/src/w.ts b/src/w.ts",
      "--- a/src/w.ts",
      "+++ b/src/w.ts",
      "@@ -1,2 +1,2 @@",
      "-const label = 'a';",
      "+const label = 'b';",
      "",
    ].join("\n");
    const change = findAnchorLine(diff, "src/w.ts", "const label");
    expect(change.side).toBe("added");
    expect(change.line).toBe(1);
  });

  test("an empty excerpt is not found", () => {
    expect(findAnchorLine(SEARCH_DIFF, "src/search.ts", "   ").found).toBe(false);
  });

  test("an excerpt that matches nothing is not found", () => {
    expect(findAnchorLine(SEARCH_DIFF, "src/search.ts", "nope").found).toBe(false);
  });

  test("a file absent from the diff is not found", () => {
    expect(findAnchorLine(SEARCH_DIFF, "src/missing.ts", "import").found).toBe(false);
  });

  test("a context line is never an anchor", () => {
    expect(findAnchorLine(SEARCH_DIFF, "src/search.ts", "const x = 1;").found).toBe(false);
  });

  test("the match does not leak into the next file's section", () => {
    const diff = [SEARCH_DIFF.trimEnd(), "diff --git a/src/next.ts b/src/next.ts", "@@ -1,1 +1,1 @@", "+only in next", ""].join("\n");
    expect(findAnchorLine(diff, "src/search.ts", "only in next").found).toBe(false);
  });
});

describe("renderDiffFence", () => {
  const diff = ["diff --git a/src/w.ts b/src/w.ts", "@@ -1,1 +1,3 @@", "+one", "+two", "+three", ""].join("\n");

  test("uses file= meta and keeps the truncation note outside the fence", () => {
    const out = renderDiffFence("src/w.ts", diff, 2);
    expect(out.startsWith("```diff file=src/w.ts\n")).toBe(true);
    const fenceEnd = out.lastIndexOf("```");
    expect(out.slice(0, fenceEnd)).not.toContain("not shown");
    expect(out.slice(fenceEnd + 3)).toBe("\n\n_2 more lines not shown._");
  });

  test("no note when under the cap", () => {
    expect(renderDiffFence("src/w.ts", diff, 80)).not.toContain("not shown");
  });
});
