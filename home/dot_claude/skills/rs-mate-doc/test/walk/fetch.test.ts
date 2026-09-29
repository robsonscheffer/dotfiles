import { describe, expect, test } from "bun:test";
import { fetchPr, fetchPrComments, parsePrRef } from "../../src/walk/fetch.ts";
import type { Env, RunResult } from "../../src/types.ts";

function fakeEnv(run: (cmd: string[]) => Promise<RunResult>): Env {
  return {
    has: () => true,
    run,
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-25T00:00:00Z"),
  };
}

describe("parsePrRef", () => {
  test("parses a full PR URL", () => {
    expect(parsePrRef("https://github.com/acme/console/pull/4242")).toEqual({ repo: "acme/console", number: 4242 });
  });

  test("parses the short org/repo#number form", () => {
    expect(parsePrRef("acme/console#4242")).toEqual({ repo: "acme/console", number: 4242 });
  });

  test("throws on input that is neither shape", () => {
    expect(() => parsePrRef("not a pr reference")).toThrow();
  });
});

describe("fetchPr", () => {
  test("fetches meta, body, diff, and files, with body as its own gh call", async () => {
    const calls: string[][] = [];
    const env = fakeEnv(async (cmd) => {
      calls.push(cmd);
      if (cmd.includes("--json") && cmd.includes("body")) {
        return { code: 0, stdout: "PR body text with a raw \x01 control char.\n", stderr: "" };
      }
      if (cmd[1] === "pr" && cmd[2] === "view") {
        return {
          code: 0,
          stdout: JSON.stringify({
            number: 4242,
            title: "feat: remove global store",
            author: { login: "sam" },
            headRefName: "refactor/x",
            headRefOid: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
            baseRefName: "main",
            baseRefOid: "b2c3d4e5f60718293a4b5c6d7e8f9012345678a",
            additions: 10,
            deletions: 5,
            changedFiles: 2,
            url: "https://github.com/acme/console/pull/4242",
          }),
          stderr: "",
        };
      }
      if (cmd[1] === "pr" && cmd[2] === "diff" && cmd.includes("--name-only")) {
        return { code: 0, stdout: "a.ts\nb.ts\n", stderr: "" };
      }
      if (cmd[1] === "pr" && cmd[2] === "diff") {
        return { code: 0, stdout: "diff --git a/a.ts b/a.ts\n", stderr: "" };
      }
      return { code: 1, stdout: "", stderr: "unexpected call" };
    });

    const result = await fetchPr("acme/console", 4242, env);
    expect(result.meta.number).toBe(4242);
    expect(result.body).toContain("raw");
    expect(result.files).toEqual(["a.ts", "b.ts"]);

    const bodyCalls = calls.filter((c) => c.includes("body"));
    expect(bodyCalls).toHaveLength(1);
    const metaCalls = calls.filter((c) => c.includes("number,title,author,headRefName,headRefOid,baseRefName,baseRefOid,additions,deletions,changedFiles,url"));
    expect(metaCalls).toHaveLength(1);
    // Body is never bundled into the structured --json call, and vice versa.
    for (const c of metaCalls) expect(c).not.toContain("body");
    for (const c of bodyCalls) expect(c).not.toContain("headRefName");
  });

  test("throws with the gh error surfaced when a call fails", async () => {
    const env = fakeEnv(async () => ({ code: 1, stdout: "", stderr: "rate limited" }));
    await expect(fetchPr("acme/console", 4242, env)).rejects.toThrow(/rate limited/);
  });
});

describe("fetchPrComments", () => {
  test("returns comments and reviews on success", async () => {
    const env = fakeEnv(async () => ({ code: 0, stdout: JSON.stringify({ comments: [{ a: 1 }], reviews: [] }), stderr: "" }));
    const result = await fetchPrComments("acme/console", 4242, env);
    expect(result.comments).toHaveLength(1);
    expect(result.reviews).toHaveLength(0);
  });

  test("is non-fatal: a gh failure returns an empty structure instead of throwing", async () => {
    const env = fakeEnv(async () => ({ code: 1, stdout: "", stderr: "boom" }));
    const result = await fetchPrComments("acme/console", 4242, env);
    expect(result).toEqual({ comments: [], reviews: [] });
  });

  test("is non-fatal: a thrown error also returns an empty structure", async () => {
    const env = fakeEnv(async () => {
      throw new Error("network down");
    });
    const result = await fetchPrComments("acme/console", 4242, env);
    expect(result).toEqual({ comments: [], reviews: [] });
  });
});
