import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCompare } from "../../src/commands/compare.ts";
import { parseAnswers } from "../../src/compare/cmux.ts";
import { EXIT, type Env, type RunResult } from "../../src/types.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-compare-int-"));
  dirs.push(dir);
  return dir;
}

const savedEnv = { ...process.env };
let home: string;
let state: string;
beforeEach(async () => {
  process.env.XDG_CONFIG_HOME = await tempDir();
  home = await tempDir();
  state = await tempDir();
  process.env.HOME = home;
  process.env.MATE_DOC_STATE_DIR = state;
});
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
});

function recordingEnv(): { env: Env; calls: string[][] } {
  const calls: string[][] = [];
  let surface = 100;
  const env: Env = {
    has: () => true,
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-29T12:00:00Z"),
    run: async (cmd): Promise<RunResult> => {
      calls.push(cmd);
      const ok = (stdout: string) => ({ code: 0, stdout, stderr: "" });
      if (cmd[1] === "new-workspace") return ok("OK workspace:7\n");
      if (cmd[1] === "list-pane-surfaces") return ok("* surface:100  /work  [selected]\n");
      if (cmd[1] === "new-split") return ok(`OK surface:${++surface} workspace:7\n`);
      return ok("OK\n");
    },
  };
  return { env, calls };
}

async function start(): Promise<{ calls: string[][]; out: string; env: Env; prompt: string }> {
  const dir = await tempDir();
  const promptFile = join(dir, "prompt.md");
  const system = join(dir, "candidate.md");
  const base = join(dir, "base-rules.md");
  const prompt = "Review it, it's short.\nSecond line.";
  await writeFile(promptFile, prompt);
  await writeFile(system, "# candidate\n");
  await writeFile(base, "# base\n");
  const out = join(dir, "out");
  const { env, calls } = recordingEnv();
  const code = await runCompare([promptFile, "--system", system, "--base-system", base, "--out", out], env);
  expect(code).toBe(EXIT.ok);
  return { calls, out, env, prompt };
}

describe("compare interactive", () => {
  test("creates the workspace, two splits, and three pane commands", async () => {
    const { calls, out, prompt } = await start();
    expect(calls[0]!.slice(0, 6)).toEqual(["cmux", "new-workspace", "--name", "compare out", "--cwd", process.cwd()]);
    const quoted = `'Review it, it'\\''s short.\nSecond line.'`;
    const commandA = calls[0]![calls[0]!.indexOf("--command") + 1]!;
    expect(commandA).toMatch(/^'claude' .*'--session-id' '[0-9a-f-]{36}' /);
    expect(commandA).not.toContain("--append-system-prompt-file");
    expect(commandA.endsWith(`'--session-id' '${commandA.match(/[0-9a-f-]{36}/)![0]}' ${quoted}`)).toBe(true);
    expect(calls[1]).toEqual(["cmux", "list-pane-surfaces", "--workspace", "workspace:7"]);
    expect(calls[2]).toEqual(["cmux", "new-split", "right", "--workspace", "workspace:7", "--surface", "surface:100"]);
    expect(calls[3]!.slice(0, 6)).toEqual(["cmux", "send", "--workspace", "workspace:7", "--surface", "surface:101"]);
    expect(calls[3]![6]).toContain(join(out, "system", "base.md"));
    expect(calls[3]![6]).toContain(quoted);
    expect(calls[3]![6]!.endsWith("\\n")).toBe(true);
    expect(calls[4]).toEqual(["cmux", "new-split", "right", "--workspace", "workspace:7", "--surface", "surface:101"]);
    expect(calls[5]![5]).toBe("surface:102");
    expect(calls[5]![6]).toContain(join(out, "system", "b.md"));
    expect(prompt).toContain("\n");
    expect(calls).toHaveLength(6);
  });

  test("writes panes.json", async () => {
    const { out } = await start();
    const panes = JSON.parse(await readFile(join(out, "panes.json"), "utf8")) as Record<string, unknown>[];
    expect(panes.map((p) => p.name)).toEqual(["A", "A-base", "B"]);
    expect(panes.map((p) => p.surface)).toEqual(["surface:100", "surface:101", "surface:102"]);
    expect(new Set(panes.map((p) => p.session_id)).size).toBe(3);
    expect(panes[2]!.argv).toContain(join(out, "system", "b.md"));
  });

  test("send types the text plus Enter into each pane", async () => {
    const { out } = await start();
    const { env, calls } = recordingEnv();
    const code = await runCompare(["send", out, "Which", "bug?"], env);
    expect(code).toBe(EXIT.ok);
    expect(calls).toEqual(
      ["surface:100", "surface:101", "surface:102"].map((s) => ["cmux", "send", "--workspace", "workspace:7", "--surface", s, "Which bug?\\n"]),
    );
  });

  test("send resolves a folder name under the state dir", async () => {
    const { out } = await start();
    await mkdir(join(state, "compare"), { recursive: true });
    await Bun.write(join(state, "compare", "run-1", "panes.json"), await readFile(join(out, "panes.json"), "utf8"));
    const { env, calls } = recordingEnv();
    expect(await runCompare(["send", "run-1", "hi"], env)).toBe(EXIT.ok);
    expect(calls).toHaveLength(3);
  });

  test("send with an unknown ts is a usage error", async () => {
    const { env, calls } = recordingEnv();
    expect(await runCompare(["send", "nope", "hi"], env)).toBe(EXIT.usage);
    expect(calls).toHaveLength(0);
  });

  test("report with an unknown ts is a usage error", async () => {
    const { env } = recordingEnv();
    expect(await runCompare(["report", "nope"], env)).toBe(EXIT.usage);
  });
});

function transcript(turns: { prompt: string; answer: string }[]): string {
  const lines: string[] = [];
  let t = Date.parse("2026-09-29T12:00:00Z");
  turns.forEach((turn, i) => {
    lines.push(JSON.stringify({ type: "user", timestamp: new Date(t).toISOString(), message: { content: turn.prompt } }));
    lines.push(
      JSON.stringify({
        type: "assistant",
        timestamp: new Date(t + 1000).toISOString(),
        requestId: `r${i}a`,
        message: { content: [{ type: "tool_use", name: "Read" }], usage: { input_tokens: 10, output_tokens: 5 } },
      }),
    );
    lines.push(JSON.stringify({ type: "user", timestamp: new Date(t + 1500).toISOString(), message: { content: [{ type: "tool_result", content: "x" }] } }));
    lines.push(
      JSON.stringify({
        type: "assistant",
        timestamp: new Date(t + 4000).toISOString(),
        requestId: `r${i}b`,
        message: {
          content: [{ type: "text", text: turn.answer }],
          usage: { input_tokens: 20, cache_read_input_tokens: 100, output_tokens: 30 },
        },
      }),
    );
    t += 10000;
  });
  return lines.join("\n") + "\n";
}

describe("compare report", () => {
  test("parseAnswers takes the last assistant text per turn", () => {
    const answers = parseAnswers(transcript([{ prompt: "one", answer: "first" }, { prompt: "two", answer: "second" }]));
    expect(answers).toEqual(["first", "second"]);
  });

  test("two turns give two tables, no verdict column, and opens the page", async () => {
    const { out } = await start();
    const panes = JSON.parse(await readFile(join(out, "panes.json"), "utf8")) as { name: string; session_id: string }[];
    const projectDir = join(home, ".claude", "projects", "proj");
    await mkdir(projectDir, { recursive: true });
    for (const pane of panes) {
      await writeFile(
        join(projectDir, `${pane.session_id}.jsonl`),
        transcript([
          { prompt: "Which bug matters most?", answer: `${pane.name} says the first bug.` },
          { prompt: "And second?", answer: `${pane.name} says the second.` },
        ]),
      );
    }
    const { env, calls } = recordingEnv();
    const code = await runCompare(["report", out], env);
    expect(code).toBe(EXIT.ok);
    const index = await readFile(join(out, "index.md"), "utf8");
    expect(index.match(/^\| {2}\| A \| A-base \| B \|$/gm)).toHaveLength(2);
    expect(index).toContain("## Turn 1");
    expect(index).toContain("## Turn 2");
    expect(index).toContain("| seconds | 4 | 4 | 4 |");
    expect(index).toContain("| context | 120 | 120 | 120 |");
    expect(index).toContain("| output | 35 | 35 | 35 |");
    expect(index).toContain("| cost | n/a | n/a | n/a |");
    expect(index).toContain("B says the second.");
    expect(index.match(/^Your verdict:$/gm)).toHaveLength(2);
    expect(index).not.toMatch(/B better|B worse|\| verdict/);
    expect(index).not.toMatch(/\|\n:::/);
    expect(calls).toEqual([["mate-doc", "open", join(out, "index.md")]]);
  });

  test("a second report after more turns rewrites the page", async () => {
    const { out } = await start();
    const panes = JSON.parse(await readFile(join(out, "panes.json"), "utf8")) as { session_id: string }[];
    const projectDir = join(home, ".claude", "projects", "proj");
    await mkdir(projectDir, { recursive: true });
    const write = (n: number) =>
      Promise.all(
        panes.map((p) =>
          writeFile(join(projectDir, `${p.session_id}.jsonl`), transcript(Array.from({ length: n }, (_, i) => ({ prompt: `q${i}`, answer: `a${i}` })))),
        ),
      );
    await write(1);
    await runCompare(["report", out], recordingEnv().env);
    expect(await readFile(join(out, "index.md"), "utf8")).not.toContain("## Turn 2");
    await write(2);
    await runCompare(["report", out], recordingEnv().env);
    expect(await readFile(join(out, "index.md"), "utf8")).toContain("## Turn 2");
  });
});
