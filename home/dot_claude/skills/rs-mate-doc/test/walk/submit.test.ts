import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXIT } from "../../src/types.ts";
import type { Env, RunResult } from "../../src/types.ts";
import { runWalkSubmit } from "../../src/walk/submit.ts";

function fakeEnv(run: (cmd: string[]) => Promise<RunResult>): Env {
  return {
    has: () => true,
    run,
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-25T00:00:00Z"),
  };
}

const WALK_INDEX = [
  "---",
  'title: "#4242: does a thing"',
  "shape: walk",
  "kind: walk",
  "status: draft",
  'summary: "does a thing"',
  'sources: ["https://github.com/acme/console/pull/4242"]',
  'pr: "acme/console#4242"',
  'verdict: ""',
  "updated: 2026-09-25",
  "---",
  "",
  "# body",
  "",
].join("\n");

async function tempWalkDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-walk-submit-"));
  await writeFile(join(dir, "index.md"), WALK_INDEX);
  return dir;
}

describe("runWalkSubmit", () => {
  test("dry run prints the body and command, and calls no runner", async () => {
    const walkDir = await tempWalkDir();
    const bodyFile = join(walkDir, "body.txt");
    await writeFile(bodyFile, "Looks good.");
    let calls = 0;
    try {
      const env = fakeEnv(async () => {
        calls++;
        return { code: 0, stdout: "", stderr: "" };
      });
      const code = await runWalkSubmit([walkDir, "--approve", "--body-file", bodyFile], env);
      expect(code).toBe(EXIT.ok);
      expect(calls).toBe(0);
    } finally {
      await rm(walkDir, { recursive: true, force: true });
    }
  });

  test("--yes calls the runner with the right args for approve, and notes appear in the body", async () => {
    const walkDir = await tempWalkDir();
    const notesFile = join(walkDir, "notes.json");
    await writeFile(notesFile, JSON.stringify({ Risks: "None called out." }));
    const calls: string[][] = [];
    try {
      const env = fakeEnv(async (cmd) => {
        calls.push(cmd);
        return { code: 0, stdout: "", stderr: "" };
      });
      const code = await runWalkSubmit([walkDir, "--approve", "--notes-file", notesFile, "--yes"], env);
      expect(code).toBe(EXIT.ok);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual(["gh", "pr", "review", "4242", "--repo", "acme/console", "--approve", "--body", "- Risks: None called out."]);
    } finally {
      await rm(walkDir, { recursive: true, force: true });
    }
  });

  test("--yes with --request-changes and --comment pass the right mode flag", async () => {
    const walkDir = await tempWalkDir();
    const calls: string[][] = [];
    const env = fakeEnv(async (cmd) => {
      calls.push(cmd);
      return { code: 0, stdout: "", stderr: "" };
    });
    try {
      await runWalkSubmit([walkDir, "--request-changes", "--yes"], env);
      await runWalkSubmit([walkDir, "--comment", "--yes"], env);
      expect(calls[0]).toEqual(["gh", "pr", "review", "4242", "--repo", "acme/console", "--request-changes"]);
      expect(calls[1]).toEqual(["gh", "pr", "review", "4242", "--repo", "acme/console", "--comment"]);
    } finally {
      await rm(walkDir, { recursive: true, force: true });
    }
  });

  test("a runner failure exits non-zero and leaves the walk's frontmatter untouched", async () => {
    const walkDir = await tempWalkDir();
    try {
      const env = fakeEnv(async () => ({ code: 1, stdout: "", stderr: "gh: could not resolve PR" }));
      const code = await runWalkSubmit([walkDir, "--approve", "--yes"], env);
      expect(code).toBe(EXIT.failed);
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(join(walkDir, "index.md"), "utf8");
      expect(raw).toBe(WALK_INDEX);
    } finally {
      await rm(walkDir, { recursive: true, force: true });
    }
  });

  test("usage error when no mode flag is given", async () => {
    const walkDir = await tempWalkDir();
    try {
      const code = await runWalkSubmit([walkDir], fakeEnv(async () => ({ code: 0, stdout: "", stderr: "" })));
      expect(code).toBe(EXIT.usage);
    } finally {
      await rm(walkDir, { recursive: true, force: true });
    }
  });

  test("usage error when the walk dir has no pr field", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mate-doc-walk-submit-nopr-"));
    await writeFile(join(dir, "index.md"), "---\ntitle: no pr\n---\nbody\n");
    try {
      const code = await runWalkSubmit([dir, "--approve"], fakeEnv(async () => ({ code: 0, stdout: "", stderr: "" })));
      expect(code).toBe(EXIT.usage);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
