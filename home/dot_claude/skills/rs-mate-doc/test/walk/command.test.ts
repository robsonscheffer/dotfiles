import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXIT } from "../../src/types.ts";
import type { Env, RunResult } from "../../src/types.ts";
import { runWalk } from "../../src/walk/command.ts";
import { FETCHED_PR, WALK_INPUTS } from "./fixture.ts";

function fakeGhEnv(): Env {
  return {
    has: () => true,
    run: async (cmd: string[]): Promise<RunResult> => {
      if (cmd.includes("comments,reviews")) {
        return { code: 0, stdout: JSON.stringify({ comments: [], reviews: [] }), stderr: "" };
      }
      if (cmd.includes("body")) {
        return { code: 0, stdout: FETCHED_PR.body, stderr: "" };
      }
      if (cmd[1] === "pr" && cmd[2] === "view") {
        return { code: 0, stdout: JSON.stringify(FETCHED_PR.meta), stderr: "" };
      }
      if (cmd[1] === "pr" && cmd[2] === "diff" && cmd.includes("--name-only")) {
        return { code: 0, stdout: `${FETCHED_PR.files.join("\n")}\n`, stderr: "" };
      }
      if (cmd[1] === "pr" && cmd[2] === "diff") {
        return { code: 0, stdout: FETCHED_PR.diff, stderr: "" };
      }
      return { code: 1, stdout: "", stderr: `unexpected call: ${cmd.join(" ")}` };
    },
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-25T00:00:00Z"),
  };
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mate-doc-walk-cmd-"));
}

describe("runWalk", () => {
  test("builds a walk folder from --inputs", async () => {
    const inputsDir = await tempDir();
    const outDir = await tempDir();
    try {
      await writeFile(join(inputsDir, "story.json"), JSON.stringify(WALK_INPUTS.story));
      await writeFile(join(inputsDir, "questions.json"), JSON.stringify(WALK_INPUTS.questions));
      await writeFile(join(inputsDir, "risks.json"), JSON.stringify(WALK_INPUTS.risks));
      await writeFile(join(inputsDir, "judgment.json"), JSON.stringify(WALK_INPUTS.judgment));
      await writeFile(join(inputsDir, "ticket-fit.json"), JSON.stringify(WALK_INPUTS.ticketFit));
      await writeFile(join(inputsDir, "comment-triage.json"), JSON.stringify(WALK_INPUTS.commentTriage));

      const code = await runWalk(["acme/console#4242", "--inputs", inputsDir, "--out", outDir], fakeGhEnv());
      expect(code).toBe(EXIT.ok);

      const files = await readdir(outDir);
      expect(files.sort()).toEqual(["claims.yaml", "index.md"]);
    } finally {
      await rm(inputsDir, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  test("writes the author from detectActor and prints a warning for the unmatched anchor", async () => {
    const inputsDir = await tempDir();
    const outDir = await tempDir();
    const saved = process.env.MATE_DOC_AGENT;
    const realWrite = process.stderr.write.bind(process.stderr);
    let err = "";
    try {
      await writeFile(join(inputsDir, "story.json"), JSON.stringify(WALK_INPUTS.story));
      await writeFile(join(inputsDir, "questions.json"), JSON.stringify(WALK_INPUTS.questions));
      await writeFile(join(inputsDir, "risks.json"), JSON.stringify(WALK_INPUTS.risks));
      await writeFile(join(inputsDir, "judgment.json"), JSON.stringify(WALK_INPUTS.judgment));
      process.env.MATE_DOC_AGENT = "x";
      process.stderr.write = ((chunk: string | Uint8Array) => {
        err += String(chunk);
        return true;
      }) as typeof process.stderr.write;
      const code = await runWalk(["acme/console#4242", "--inputs", inputsDir, "--out", outDir], fakeGhEnv());
      process.stderr.write = realWrite;
      expect(code).toBe(EXIT.ok);
      const yaml = await Bun.file(join(outDir, "claims.yaml")).text();
      expect(yaml.startsWith('author: "agent:x"\n')).toBe(true);
      expect(err).toContain("mate-doc walk: warning: group 02");
    } finally {
      process.stderr.write = realWrite;
      if (saved === undefined) delete process.env.MATE_DOC_AGENT;
      else process.env.MATE_DOC_AGENT = saved;
      await rm(inputsDir, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  test("accepts a full PR URL too", async () => {
    const inputsDir = await tempDir();
    const outDir = await tempDir();
    try {
      await writeFile(join(inputsDir, "story.json"), JSON.stringify(WALK_INPUTS.story));
      await writeFile(join(inputsDir, "questions.json"), JSON.stringify(WALK_INPUTS.questions));
      await writeFile(join(inputsDir, "risks.json"), JSON.stringify(WALK_INPUTS.risks));
      await writeFile(join(inputsDir, "judgment.json"), JSON.stringify(WALK_INPUTS.judgment));

      const code = await runWalk(["https://github.com/acme/console/pull/4242", "--inputs", inputsDir, "--out", outDir], fakeGhEnv());
      expect(code).toBe(EXIT.ok);
    } finally {
      await rm(inputsDir, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  test("--fetch-only writes the raw fetched files without needing --inputs", async () => {
    const outDir = await tempDir();
    try {
      const code = await runWalk(["https://github.com/acme/console/pull/4242", "--fetch-only", "--out", outDir], fakeGhEnv());
      expect(code).toBe(EXIT.ok);
      const files = await readdir(outDir);
      expect(files).toContain("meta.json");
      expect(files).toContain("body.txt");
      expect(files).toContain("diff.patch");
      expect(files).toContain("files.txt");
      expect(files).toContain("comments.json");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  test("usage error when --inputs is missing and --fetch-only wasn't passed", async () => {
    const outDir = await tempDir();
    try {
      const code = await runWalk(["acme/console#4242", "--out", outDir], fakeGhEnv());
      expect(code).toBe(EXIT.usage);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  test("usage error when no PR reference is given", async () => {
    const code = await runWalk([], fakeGhEnv());
    expect(code).toBe(EXIT.usage);
  });

  test("usage error on a malformed PR reference", async () => {
    const code = await runWalk(["not-a-pr"], fakeGhEnv());
    expect(code).toBe(EXIT.usage);
  });
});
