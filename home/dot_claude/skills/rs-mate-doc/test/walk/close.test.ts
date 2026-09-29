import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXIT } from "../../src/types.ts";
import type { Env, RunResult } from "../../src/types.ts";
import { applyCloseToFrontmatter, runWalkClose } from "../../src/walk/close.ts";

function fakeEnv(run: (cmd: string[]) => Promise<RunResult>): Env {
  return {
    has: () => true,
    run,
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-29T00:00:00Z"),
  };
}

const WALK_INDEX = [
  "---",
  'title: "#4242: does a thing"',
  "shape: walk",
  "kind: walk",
  "status: draft",
  'summary: "does a thing"',
  'tags: ["ABC-12"]',
  'sources: ["https://github.com/acme/console/pull/4242"]',
  'pr: "acme/console#4242"',
  'verdict: ""',
  "updated: 2026-09-25",
  "---",
  "",
  "# #4242: does a thing",
  "",
  "Some body text with a **bold** claim and a trailing blank line.",
  "",
].join("\n");

async function tempWalkDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-walk-close-"));
  await writeFile(join(dir, "index.md"), WALK_INDEX);
  return dir;
}

async function tempConfig(closeHook: string | undefined): Promise<{ dir: string; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-walk-close-cfg-"));
  const path = join(dir, "config.yaml");
  const yaml = closeHook === undefined ? "walk: {}\n" : `walk:\n  close_hook: ${JSON.stringify(closeHook)}\n`;
  await writeFile(path, yaml);
  return { dir, path };
}

describe("applyCloseToFrontmatter", () => {
  test("writes verdict and closed, preserves other keys and the body byte for byte", () => {
    const updated = applyCloseToFrontmatter(WALK_INDEX, "approved", "2026-09-29");
    expect(updated).toContain('verdict: approved');
    expect(updated).toContain("closed: 2026-09-29");
    expect(updated).toContain('title: "#4242: does a thing"');
    expect(updated).toContain('tags: ["ABC-12"]');
    const bodyBefore = WALK_INDEX.slice(WALK_INDEX.indexOf("\n\n# #4242"));
    const bodyAfter = updated.slice(updated.indexOf("\n\n# #4242"));
    expect(bodyAfter).toBe(bodyBefore);
  });
});

describe("runWalkClose", () => {
  test("close without a configured hook works", async () => {
    const walkDir = await tempWalkDir();
    const { dir: cfgDir, path: cfgPath } = await tempConfig(undefined);
    try {
      const env = fakeEnv(async () => ({ code: 0, stdout: "", stderr: "" }));
      const code = await runWalkClose([walkDir, "--verdict", "approved"], env, { MATE_DOC_CONFIG: cfgPath });
      expect(code).toBe(EXIT.ok);
      const raw = await readFile(join(walkDir, "index.md"), "utf8");
      expect(raw).toContain("verdict: approved");
      expect(raw).toContain("closed: 2026-09-29");
    } finally {
      await rm(walkDir, { recursive: true, force: true });
      await rm(cfgDir, { recursive: true, force: true });
    }
  });

  test("runs the hook with the five env vars", async () => {
    const walkDir = await tempWalkDir();
    const { dir: cfgDir, path: cfgPath } = await tempConfig("true");
    const calls: string[][] = [];
    try {
      const env = fakeEnv(async (cmd) => {
        calls.push(cmd);
        return { code: 0, stdout: "", stderr: "" };
      });
      const notesFile = join(walkDir, "notes.json");
      await writeFile(notesFile, "{}");
      const code = await runWalkClose([walkDir, "--verdict", "changes-requested", "--notes-file", notesFile], env, {
        MATE_DOC_CONFIG: cfgPath,
      });
      expect(code).toBe(EXIT.ok);
      expect(calls).toHaveLength(1);
      expect(calls[0]![0]).toBe("sh");
      expect(calls[0]![1]).toBe("-c");
      const script = calls[0]![2]!;
      expect(script).toContain(`MATE_DOC_WALK_DIR=${walkDir}`);
      expect(script).toContain("MATE_DOC_PR=4242");
      expect(script).toContain("MATE_DOC_REPO=acme/console");
      expect(script).toContain("MATE_DOC_VERDICT=changes-requested");
      expect(script).toContain(`MATE_DOC_NOTES_FILE=${notesFile}`);
      expect(script.trim().endsWith("true")).toBe(true);
    } finally {
      await rm(walkDir, { recursive: true, force: true });
      await rm(cfgDir, { recursive: true, force: true });
    }
  });

  test("reports a hook failure", async () => {
    const walkDir = await tempWalkDir();
    const { dir: cfgDir, path: cfgPath } = await tempConfig("false");
    try {
      const env = fakeEnv(async () => ({ code: 1, stdout: "", stderr: "hook exploded" }));
      const code = await runWalkClose([walkDir, "--verdict", "skipped"], env, { MATE_DOC_CONFIG: cfgPath });
      expect(code).toBe(EXIT.failed);
      const raw = await readFile(join(walkDir, "index.md"), "utf8");
      expect(raw).toContain("verdict: skipped");
    } finally {
      await rm(walkDir, { recursive: true, force: true });
      await rm(cfgDir, { recursive: true, force: true });
    }
  });

  test("usage error when --verdict is missing or invalid", async () => {
    const walkDir = await tempWalkDir();
    try {
      const env = fakeEnv(async () => ({ code: 0, stdout: "", stderr: "" }));
      const code = await runWalkClose([walkDir], env, {});
      expect(code).toBe(EXIT.usage);
    } finally {
      await rm(walkDir, { recursive: true, force: true });
    }
  });
});
