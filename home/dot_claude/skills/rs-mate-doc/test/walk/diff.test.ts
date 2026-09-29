// Regression coverage for the excerpt/anchor mismatch: a modify hunk's first changed line is
// almost always the removed line, but that line only exists at the PR's base commit, not the
// head commit compose.ts anchors every code claim to. firstFileChange has to say which image
// (added -> head, removed -> base) its excerpt belongs to.
import { describe, expect, test } from "bun:test";
import { firstFileChange } from "../../src/walk/diff.ts";

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

describe("firstFileChange", () => {
  test("a modify hunk yields the added line, at the new-file line number, anchored at head", () => {
    const change = firstFileChange(MODIFY_DIFF, "src/widget.ts");
    expect(change.found).toBe(true);
    expect(change.excerpt).toBe("return 'new label';");
    expect(change.side).toBe("added");
    expect(change.line).toBe(11);
  });

  test("a pure-removal hunk yields the removed line, at the old-file line number, anchored at base", () => {
    const change = firstFileChange(PURE_REMOVAL_DIFF, "src/legacy.ts");
    expect(change.found).toBe(true);
    expect(change.excerpt).toBe("export const UNUSED_FLAG = false;");
    expect(change.side).toBe("removed");
    expect(change.line).toBe(10);
  });

  test("a file with no content change is not found", () => {
    const change = firstFileChange(NO_CHANGE_DIFF, "src/other.ts");
    expect(change.found).toBe(false);
  });

  test("a file absent from the diff is not found", () => {
    const change = firstFileChange(MODIFY_DIFF, "src/missing.ts");
    expect(change.found).toBe(false);
  });

  test("a multi-hunk file with an added line in a later hunk still prefers added over an earlier removed line", () => {
    const diff = [
      "diff --git a/src/multi.ts b/src/multi.ts",
      "index 8f2a1c4..b93e017 100644",
      "--- a/src/multi.ts",
      "+++ b/src/multi.ts",
      "@@ -1,2 +1,1 @@",
      "-export const A = 1;",
      "@@ -20,1 +19,2 @@",
      "+export const B = 2;",
      "",
    ].join("\n");
    const change = firstFileChange(diff, "src/multi.ts");
    expect(change.side).toBe("added");
    expect(change.excerpt).toBe("export const B = 2;");
    expect(change.line).toBe(19);
  });
});
