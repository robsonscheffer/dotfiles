import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCompare } from "../../src/commands/compare.ts";
import { EXIT, type Env, type RunResult } from "../../src/types.ts";

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

let home: string;
beforeEach(async () => {
  // No mate-doc/config.yaml and an empty HOME: defaults apply and no real transcript is read.
  process.env.XDG_CONFIG_HOME = await tempDir();
  home = await tempDir();
  process.env.HOME = home;
});

interface Call {
  cmd: string[];
  opts?: { input?: string; cwd?: string };
}

type Responder = (cmd: string[], call: number) => RunResult | Promise<RunResult>;

function recordingEnv(respond: Responder): { env: Env; calls: Call[] } {
  const calls: Call[] = [];
  const env: Env = {
    has: () => true,
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-29T12:00:00Z"),
    run: async (cmd, opts) => {
      calls.push({ cmd, opts });
      return respond(cmd, calls.length - 1);
    },
  };
  return { env, calls };
}

function json(result: string, extra: Record<string, unknown> = {}): RunResult {
  return {
    code: 0,
    stdout: JSON.stringify({ result, total_cost_usd: 0.01, duration_ms: 2000, ...extra }),
    stderr: "",
  };
}

function paneOf(cmd: string[]): "A" | "A-base" | "B" {
  const joined = cmd.join(" ");
  if (joined.includes("b.md")) return "B";
  if (joined.includes("base.md")) return "A-base";
  return "A";
}

function sessionOf(cmd: string[]): string {
  return cmd[cmd.indexOf("--session-id") + 1]!;
}

interface Fixture {
  dir: string;
  prompt: string;
  system: string;
  base: string;
  out: string;
}

async function fixture(): Promise<Fixture> {
  const dir = await tempDir();
  const prompt = join(dir, "prompt.md");
  const system = join(dir, "candidate.md");
  const base = join(dir, "base-rules.md");
  await writeFile(prompt, "Explain the refund policy.");
  await writeFile(system, "# candidate rules\n");
  await writeFile(base, "# base rules\n");
  return { dir, prompt, system, base, out: join(dir, "out") };
}

function baseArgs(f: Fixture, extra: string[] = []): string[] {
  return [f.prompt, "--system", f.system, "--base-system", f.base, "--print", "--out", f.out, ...extra];
}

async function captureStderr<T>(fn: () => Promise<T>): Promise<{ value: T; text: string }> {
  const written: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    written.push(chunk.toString());
    return true;
  }) as typeof process.stderr.write;
  try {
    return { value: await fn(), text: written.join("") };
  } finally {
    process.stderr.write = original;
  }
}

describe("mate-doc compare usage errors", () => {
  test("--core is removed and the message names --system", async () => {
    const f = await fixture();
    const { env, calls } = recordingEnv(() => json("x"));
    const { value, text } = await captureStderr(() => runCompare([f.prompt, "--core", f.system, "--print"], env));
    expect(value).toBe(EXIT.usage);
    expect(text).toContain("--system");
    expect(calls).toHaveLength(0);
  });

  test("missing --system", async () => {
    const f = await fixture();
    const { env } = recordingEnv(() => json("x"));
    expect(await runCompare([f.prompt, "--print", "--base-system", f.base], env)).toBe(EXIT.usage);
  });

  test("--runs below 1 or not a number", async () => {
    const f = await fixture();
    const { env } = recordingEnv(() => json("x"));
    expect(await runCompare(baseArgs(f, ["--runs", "0"]), env)).toBe(EXIT.usage);
    expect(await runCompare(baseArgs(f, ["--runs", "abc"]), env)).toBe(EXIT.usage);
  });

  test("--set without --print is a usage error", async () => {
    const f = await fixture();
    const { env, calls } = recordingEnv(() => json("x"));
    const { value, text } = await captureStderr(() =>
      runCompare(["--set", f.dir, "--system", f.system, "--base-system", f.base], env),
    );
    expect(value).toBe(EXIT.usage);
    expect(text).toContain("--set needs --print");
    expect(calls).toHaveLength(0);
  });

  test("missing prompt, system, or base-system file", async () => {
    const f = await fixture();
    const { env } = recordingEnv(() => json("x"));
    expect(await runCompare(["/does/not/exist.md", "--system", f.system, "--base-system", f.base, "--print"], env)).toBe(
      EXIT.usage,
    );
    expect(await runCompare([f.prompt, "--system", "/does/not/exist.md", "--base-system", f.base, "--print"], env)).toBe(
      EXIT.usage,
    );
    expect(await runCompare([f.prompt, "--system", f.system, "--base-system", "/does/not/exist.md", "--print"], env)).toBe(
      EXIT.usage,
    );
  });
});

describe("mate-doc compare batch", () => {
  test("every pane runs in an empty work folder that exists before the first run", async () => {
    const f = await fixture();
    let listing: string[] | undefined;
    const { env } = recordingEnv((_cmd, call) => {
      if (call === 0) listing = readdirSync(join(f.out, "work"));
      return json("answer");
    });

    expect(await runCompare(baseArgs(f, []), env)).toBe(EXIT.ok);
    expect(listing).toEqual([]);
  });

  test("3 panes x 2 runs calls the right argv with the prompt as input and the cwd", async () => {
    const f = await fixture();
    const { env, calls } = recordingEnv(() => json("answer"));

    const code = await runCompare(baseArgs(f, ["--runs", "2"]), env);

    expect(code).toBe(EXIT.ok);
    expect(calls).toHaveLength(6);
    expect(calls.map((c) => paneOf(c.cmd))).toEqual(["A", "A-base", "B", "A", "A-base", "B"]);
    for (const call of calls) {
      const tail = call.cmd.slice(-5);
      expect(tail.slice(0, 3)).toEqual(["-p", "--output-format", "json"]);
      expect(tail[3]).toBe("--session-id");
      expect(tail[4]).toMatch(/^[0-9a-f-]{36}$/);
      expect(call.opts?.input).toBe("Explain the refund policy.");
      expect(call.opts?.cwd).toBe(join(f.out, "work"));
    }
    expect(new Set(calls.map((c) => sessionOf(c.cmd))).size).toBe(6);
    expect(calls[0]!.cmd.join(" ")).not.toContain(".md");
  });

  test("A-base and B differ only at the system path, and point at the copies", async () => {
    const f = await fixture();
    const { env, calls } = recordingEnv(() => json("answer"));

    await runCompare(baseArgs(f, ["--runs", "1", "--model", "opus"]), env);

    const strip = (cmd: string[]) => cmd.slice(0, -2);
    const baseCmd = strip(calls[1]!.cmd);
    const bCmd = strip(calls[2]!.cmd);
    const diff = baseCmd.map((part, i) => [part, bCmd[i]]).filter(([x, y]) => x !== y);
    expect(baseCmd).toHaveLength(bCmd.length);
    expect(diff).toEqual([[join(f.out, "system", "base.md"), join(f.out, "system", "b.md")]]);
    expect(baseCmd).toContain("--model");
    expect(baseCmd).toContain("opus");
  });

  test("copies the two files and writes sha256.txt", async () => {
    const f = await fixture();
    const { env } = recordingEnv(() => json("answer"));

    await runCompare(baseArgs(f, ["--runs", "1"]), env);

    expect(await readFile(join(f.out, "system", "base.md"), "utf8")).toBe("# base rules\n");
    expect(await readFile(join(f.out, "system", "b.md"), "utf8")).toBe("# candidate rules\n");
    const hash = (t: string) => createHash("sha256").update(t).digest("hex");
    expect(await readFile(join(f.out, "system", "sha256.txt"), "utf8")).toBe(
      `${hash("# base rules\n")}  base.md\n${hash("# candidate rules\n")}  b.md\n`,
    );
  });

  test("saves run-n.md and run-n.json per pane", async () => {
    const f = await fixture();
    const { env } = recordingEnv((cmd) => json(`answer from ${paneOf(cmd)}`));

    await runCompare(baseArgs(f, ["--runs", "2"]), env);

    for (const pane of ["A", "A-base", "B"]) {
      for (const n of [1, 2]) {
        expect(await readFile(join(f.out, pane, `run-${n}.md`), "utf8")).toBe(`answer from ${pane}`);
        const raw = JSON.parse(await readFile(join(f.out, pane, `run-${n}.json`), "utf8"));
        expect(raw.result).toBe(`answer from ${pane}`);
      }
    }
  });

  test("a failing pane exits failed and writes no index", async () => {
    const f = await fixture();
    const { env } = recordingEnv((cmd) =>
      paneOf(cmd) === "B" ? { code: 1, stdout: "", stderr: "claude: not authenticated" } : json("ok"),
    );

    const { value, text } = await captureStderr(() => runCompare(baseArgs(f, ["--runs", "1"]), env));

    expect(value).toBe(EXIT.failed);
    expect(text).toContain("exit 1");
    expect(text).toContain("not authenticated");
    await expect(readFile(join(f.out, "index.md"), "utf8")).rejects.toThrow();
  });

  test("unparseable JSON exits failed", async () => {
    const f = await fixture();
    const { env } = recordingEnv(() => ({ code: 0, stdout: "not json", stderr: "" }));
    const { value, text } = await captureStderr(() => runCompare(baseArgs(f, ["--runs", "1"]), env));
    expect(value).toBe(EXIT.failed);
    expect(text).toContain("unparseable");
  });

  test("uses transcript metrics when the session file exists", async () => {
    const f = await fixture();
    const projectDir = join(home, ".claude", "projects", "proj");
    await mkdir(projectDir, { recursive: true });
    const { env } = recordingEnv(async (cmd) => {
      const lines = [
        { type: "user", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "hi" } },
        {
          type: "assistant",
          timestamp: "2026-01-01T00:00:07.000Z",
          requestId: "r1",
          message: { usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0, output_tokens: 40 } },
        },
      ];
      await writeFile(join(projectDir, `${sessionOf(cmd)}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n"));
      return json("answer", { duration_ms: 99000 });
    });

    await runCompare(baseArgs(f, ["--runs", "1"]), env);

    const index = await readFile(join(f.out, "index.md"), "utf8");
    expect(index).toMatch(/\| seconds \| 7 \| 7 \| 7 \|/);
    expect(index).toMatch(/\| context \| 100 \| 100 \| 100 \|/);
    expect(index).toMatch(/\| output \| 40 \| 40 \| 40 \|/);
  });

  test("falls back to duration_ms and n/a when no transcript exists", async () => {
    const f = await fixture();
    const { env } = recordingEnv(() => json("answer", { duration_ms: 4500 }));

    await runCompare(baseArgs(f, ["--runs", "1"]), env);

    const index = await readFile(join(f.out, "index.md"), "utf8");
    expect(index).toMatch(/\| seconds \| 4\.5 \| 4\.5 \| 4\.5 \|/);
    expect(index).toMatch(/\| context \| n\/a \| n\/a \| n\/a \|/);
    expect(index).toMatch(/\| output \| n\/a \| n\/a \| n\/a \|/);
    expect(index).toMatch(/\| cost \| \$0\.0100 \| \$0\.0100 \| \$0\.0100 \|/);
  });

  test("table cells and verdict when B is clearly shorter", async () => {
    const f = await fixture();
    const long = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    const { env } = recordingEnv((cmd, i) => {
      const run = Math.floor(i / 3);
      const pane = paneOf(cmd);
      if (pane === "B") return json(long(5 + run));
      return json(long(50 + run * 2));
    });

    const code = await runCompare(baseArgs(f, ["--runs", "2"]), env);

    expect(code).toBe(EXIT.ok);
    const index = await readFile(join(f.out, "index.md"), "utf8");
    expect(index).toContain("| words | 51 [50..52] | 51 [50..52] | 5.5 [5..6] | B better |");
    expect(index).toContain("| em-dashes | 0 [0..0] | 0 [0..0] | 0 [0..0] | same |");
    expect(index).toContain("Your verdict:");
    expect(index).toContain("## Run 2");
  });
});

describe("mate-doc compare --set", () => {
  test("runs every .md in the dir, one folder per prompt, plus a top index", async () => {
    const f = await fixture();
    const setDir = join(f.dir, "set");
    await mkdir(setDir);
    await writeFile(join(setDir, "alpha.md"), "First prompt.");
    await writeFile(join(setDir, "beta.md"), "Second prompt.");
    await writeFile(join(setDir, "notes.txt"), "ignored");
    const { env, calls } = recordingEnv(() => json("answer"));

    const code = await runCompare(
      ["--set", setDir, "--system", f.system, "--base-system", f.base, "--print", "--runs", "1", "--out", f.out],
      env,
    );

    expect(code).toBe(EXIT.ok);
    expect(calls).toHaveLength(6);
    expect(calls.slice(0, 3).every((c) => c.opts?.input === "First prompt.")).toBe(true);
    expect(calls.slice(3).every((c) => c.opts?.input === "Second prompt.")).toBe(true);
    expect(await readFile(join(f.out, "alpha", "B", "run-1.md"), "utf8")).toBe("answer");
    expect(await readFile(join(f.out, "beta", "index.md"), "utf8")).toContain("Second prompt.");
    expect(await readFile(join(f.out, "system", "b.md"), "utf8")).toBe("# candidate rules\n");
    const top = await readFile(join(f.out, "index.md"), "utf8");
    expect(top).toContain("[alpha](alpha/index.md)");
    expect(top).toContain("[beta](beta/index.md)");
    expect(top).toContain("words: single run");
  });

  test("defaults to the bundled prompts", async () => {
    const f = await fixture();
    const { env, calls } = recordingEnv(() => json("answer"));

    const code = await runCompare(
      ["--set", "--system", f.system, "--base-system", f.base, "--print", "--runs", "1", "--out", f.out],
      env,
    );

    expect(code).toBe(EXIT.ok);
    expect(calls).toHaveLength(9);
    const top = await readFile(join(f.out, "index.md"), "utf8");
    for (const name of ["prompt-debug", "prompt-recommend", "prompt-review"]) {
      expect(top).toContain(`[${name}](${name}/index.md)`);
    }
  });
});
