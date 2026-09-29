import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCompare } from "../../src/commands/compare.ts";
import type { Env, RunResult } from "../../src/types.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-compare-cmd-"));
  dirs.push(dir);
  return dir;
}

const savedEnv = { ...process.env };
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
});

let emptyConfigDir: string;
beforeEach(async () => {
  // Point XDG_CONFIG_HOME at a folder with no mate-doc/config.yaml so every test that does not
  // set up its own config falls back to the default compare command, regardless of what is
  // actually installed on the machine running the suite.
  emptyConfigDir = await tempDir();
  process.env.XDG_CONFIG_HOME = emptyConfigDir;
});

interface Call {
  cmd: string[];
  opts?: { input?: string };
}

function recordingEnv(results: RunResult[]): { env: Env; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const env: Env = {
    has: () => true,
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-29T12:00:00Z"),
    run: async (cmd, opts) => {
      calls.push({ cmd, opts });
      const result = results[i] ?? { code: 0, stdout: "", stderr: "" };
      i++;
      return result;
    },
  };
  return { env, calls };
}

async function writePromptFile(dir: string, text = "Explain the refund policy."): Promise<string> {
  const path = join(dir, "prompt.md");
  await writeFile(path, text);
  return path;
}

async function writeCoreFile(dir: string, text = "# core rules\n"): Promise<string> {
  const path = join(dir, "AGENTS.md");
  await writeFile(path, text);
  return path;
}

describe("mate-doc compare", () => {
  test("builds the default without/with commands and pipes the prompt on stdin", async () => {
    const dir = await tempDir();
    const promptPath = await writePromptFile(dir);
    const corePath = await writeCoreFile(dir);
    const outDir = join(dir, "out");
    const { env, calls } = recordingEnv([
      { code: 0, stdout: "plain answer", stderr: "" },
      { code: 0, stdout: "core answer", stderr: "" },
    ]);

    const code = await runCompare([promptPath, "--core", corePath, "--out", outDir], env);

    expect(code).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.cmd).toEqual(["claude", "-p", "--bare"]);
    expect(calls[0]!.opts?.input).toBe("Explain the refund policy.");
    expect(calls[1]!.cmd).toEqual(["claude", "-p", "--bare", "--append-system-prompt-file", corePath]);
    expect(calls[1]!.opts?.input).toBe("Explain the refund policy.");
  });

  test("passes --model through to both invocations", async () => {
    const dir = await tempDir();
    const promptPath = await writePromptFile(dir);
    const corePath = await writeCoreFile(dir);
    const outDir = join(dir, "out");
    const { env, calls } = recordingEnv([
      { code: 0, stdout: "plain", stderr: "" },
      { code: 0, stdout: "core", stderr: "" },
    ]);

    await runCompare([promptPath, "--core", corePath, "--out", outDir, "--model", "opus"], env);

    expect(calls[0]!.cmd).toEqual(["claude", "-p", "--bare", "--model", "opus"]);
    expect(calls[1]!.cmd).toEqual([
      "claude",
      "-p",
      "--bare",
      "--append-system-prompt-file",
      corePath,
      "--model",
      "opus",
    ]);
  });

  test("reads the base command from compare.command in config.yaml", async () => {
    const dir = await tempDir();
    const promptPath = await writePromptFile(dir);
    const corePath = await writeCoreFile(dir);
    const outDir = join(dir, "out");
    const configDir = join(emptyConfigDir, "mate-doc");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.yaml"), "compare:\n  command: codex exec --json\n");
    const { env, calls } = recordingEnv([
      { code: 0, stdout: "plain", stderr: "" },
      { code: 0, stdout: "core", stderr: "" },
    ]);

    await runCompare([promptPath, "--core", corePath, "--out", outDir], env);

    expect(calls[0]!.cmd).toEqual(["codex", "exec", "--json"]);
    expect(calls[1]!.cmd).toEqual(["codex", "exec", "--json", "--append-system-prompt-file", corePath]);
  });

  test("writes without.md, with.md, and an index.md that reports the core hash", async () => {
    const dir = await tempDir();
    const promptPath = await writePromptFile(dir);
    const corePath = await writeCoreFile(dir, "# core rules\n");
    const outDir = join(dir, "out");
    const { env } = recordingEnv([
      { code: 0, stdout: "plain answer", stderr: "" },
      { code: 0, stdout: "core answer", stderr: "" },
    ]);

    const code = await runCompare([promptPath, "--core", corePath, "--out", outDir], env);

    expect(code).toBe(0);
    expect(await readFile(join(outDir, "without.md"), "utf8")).toBe("plain answer");
    expect(await readFile(join(outDir, "with.md"), "utf8")).toBe("core answer");
    const index = await readFile(join(outDir, "index.md"), "utf8");
    const expectedHash = createHash("sha256").update("# core rules\n").digest("hex");
    expect(index).toContain(expectedHash);
    expect(index).toContain(corePath);
  });

  test("numbers without/with files per run when --runs > 1", async () => {
    const dir = await tempDir();
    const promptPath = await writePromptFile(dir);
    const corePath = await writeCoreFile(dir);
    const outDir = join(dir, "out");
    const { env } = recordingEnv([
      { code: 0, stdout: "plain-1", stderr: "" },
      { code: 0, stdout: "core-1", stderr: "" },
      { code: 0, stdout: "plain-2", stderr: "" },
      { code: 0, stdout: "core-2", stderr: "" },
    ]);

    const code = await runCompare([promptPath, "--core", corePath, "--out", outDir, "--runs", "2"], env);

    expect(code).toBe(0);
    expect(await readFile(join(outDir, "without-1.md"), "utf8")).toBe("plain-1");
    expect(await readFile(join(outDir, "with-1.md"), "utf8")).toBe("core-1");
    expect(await readFile(join(outDir, "without-2.md"), "utf8")).toBe("plain-2");
    expect(await readFile(join(outDir, "with-2.md"), "utf8")).toBe("core-2");
  });

  test("exits non-zero with the runner's error when the without-core call fails", async () => {
    const dir = await tempDir();
    const promptPath = await writePromptFile(dir);
    const corePath = await writeCoreFile(dir);
    const outDir = join(dir, "out");
    const { env } = recordingEnv([{ code: 1, stdout: "", stderr: "claude: not authenticated" }]);

    const code = await runCompare([promptPath, "--core", corePath, "--out", outDir], env);

    expect(code).not.toBe(0);
    await expect(readFile(join(outDir, "index.md"), "utf8")).rejects.toThrow();
  });

  test("exits non-zero with the runner's error when the with-core call fails", async () => {
    const dir = await tempDir();
    const promptPath = await writePromptFile(dir);
    const corePath = await writeCoreFile(dir);
    const outDir = join(dir, "out");
    const { env } = recordingEnv([
      { code: 0, stdout: "plain", stderr: "" },
      { code: 1, stdout: "", stderr: "claude: not authenticated" },
    ]);

    const code = await runCompare([promptPath, "--core", corePath, "--out", outDir], env);

    expect(code).not.toBe(0);
    await expect(readFile(join(outDir, "index.md"), "utf8")).rejects.toThrow();
  });

  test("usage error when the prompt file does not exist", async () => {
    const { env } = recordingEnv([]);
    const code = await runCompare(["/does/not/exist.md"], env);
    expect(code).toBe(2);
  });

  test("environment error when the core file does not exist", async () => {
    const dir = await tempDir();
    const promptPath = await writePromptFile(dir);
    const { env } = recordingEnv([]);
    const code = await runCompare([promptPath, "--core", "/does/not/exist/AGENTS.md"], env);
    expect(code).toBe(3);
  });
});
