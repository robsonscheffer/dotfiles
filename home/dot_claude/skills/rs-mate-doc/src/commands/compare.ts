// `mate-doc compare <prompt-file> --system <file> [--base-system <file>] --print [--runs N]
// [--model M] [--out <dir>]`, and `mate-doc compare --set [dir] --system <file> --print ...`:
// run the same prompt in three panes (A everyday agent, A-base with the base rules file, B with
// the candidate file), N runs each, score every answer with the configured checks, and write a
// verdict page.
//
// Each call is `<pane argv> -p --output-format json --session-id <uuid>` with the prompt on
// stdin, run in the current directory through env.run so tests never spawn a real process.
// Run folder: system/{base.md,b.md,sha256.txt}, <pane>/run-<n>.{md,json}, index.md. With --set,
// one sub-folder per prompt file plus a top index.md; system/ stays at the top.
// --base-system defaults to ~/.claude/AGENTS.md, --runs to 3. Without --print the interactive
// mode is not built yet.
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { loadCompareConfig } from "../compare/config.ts";
import { paneCommands } from "../compare/panes.ts";
import { composeCompare, composeSetIndex, type CompareRun, type PaneRun, type SetEntry } from "../compare/render.ts";
import { runChecks } from "../compare/checks.ts";
import { readTurnMetrics } from "../compare/transcript.ts";
import type { CompareConfig, Pane } from "../compare/types.ts";
import { createEnv } from "../env.ts";
import { defaultStateDir } from "../serve/state.ts";
import { EXIT, type Env } from "../types.ts";

const USAGE =
  "usage: mate-doc compare <prompt-file> --system <file> [--base-system <file>] --print [--runs N] [--model M] [--out <dir>]\n" +
  "       mate-doc compare --set [dir] --system <file> --print [--runs N] [--model M] [--out <dir>]";

interface ParsedArgs {
  promptFile?: string;
  core: boolean;
  system?: string;
  baseSystem?: string;
  out?: string;
  runs: number;
  model?: string;
  print: boolean;
  set: boolean;
  setDir?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { runs: 3, core: false, print: false, set: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--core") out.core = true;
    else if (arg === "--system") out.system = argv[++i];
    else if (arg === "--base-system") out.baseSystem = argv[++i];
    else if (arg === "--out") out.out = argv[++i];
    else if (arg === "--runs") out.runs = Number(argv[++i]);
    else if (arg === "--model") out.model = argv[++i];
    else if (arg === "--print") out.print = true;
    else if (arg === "--set") {
      out.set = true;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) out.setDir = argv[++i];
    } else if (arg !== undefined) positional.push(arg);
  }
  out.promptFile = positional[0];
  return out;
}

function timestampFolder(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

// Reports the exit code plus the first 500 characters of stderr, or of stdout when stderr is
// empty (an agent CLI's auth error can land on stdout, as `claude -p --bare` does).
function describeFailure(result: { code: number; stdout: string; stderr: string }): string {
  const text = result.stderr.trim().length > 0 ? result.stderr : result.stdout;
  return `exit ${result.code}: ${text.slice(0, 500)}`;
}

function usage(message: string): number {
  process.stderr.write(`mate-doc compare: ${message}\n`);
  return EXIT.usage;
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface AgentJson {
  result: string;
  cost: number | null;
  durationMs: number | null;
}

function parseAgentJson(stdout: string): AgentJson | null {
  try {
    const data = JSON.parse(stdout) as Record<string, unknown> | null;
    if (!data || typeof data !== "object" || typeof data.result !== "string") return null;
    return {
      result: data.result,
      cost: typeof data.total_cost_usd === "number" ? data.total_cost_usd : null,
      durationMs: typeof data.duration_ms === "number" ? data.duration_ms : null,
    };
  } catch {
    return null;
  }
}

interface PromptOutcome {
  verdicts: SetEntry["verdicts"];
}

// Runs every pane N times for one prompt and writes its folder. Returns null after reporting
// a failure.
async function runPrompt(
  env: Env,
  cfg: CompareConfig,
  panes: Pane[],
  promptFile: string,
  prompt: string,
  args: ParsedArgs,
  dir: string,
  system: { basePath: string; baseHash: string; bPath: string; bHash: string },
): Promise<PromptOutcome | null> {
  const runs: CompareRun[] = [];
  for (let n = 1; n <= args.runs; n++) {
    const run = {} as CompareRun;
    for (const pane of panes) {
      const sessionId = randomUUID();
      const cmd = [...pane.argv, "-p", "--output-format", "json", "--session-id", sessionId];
      const result = await env.run(cmd, { input: prompt, cwd: process.cwd() });
      if (result.code !== 0) {
        process.stderr.write(`mate-doc compare: ${cmd.join(" ")} failed: ${describeFailure(result)}\n`);
        return null;
      }
      const parsed = parseAgentJson(result.stdout);
      if (!parsed) {
        process.stderr.write(`mate-doc compare: ${cmd.join(" ")} failed: unparseable JSON: ${result.stdout.slice(0, 500)}\n`);
        return null;
      }
      await Bun.write(join(dir, pane.name, `run-${n}.md`), parsed.result);
      await Bun.write(join(dir, pane.name, `run-${n}.json`), result.stdout);

      const turn = (await readTurnMetrics(sessionId, process.env.HOME || homedir()))?.[0];
      run[pane.name] = {
        text: parsed.result,
        checks: runChecks(parsed.result, cfg.checks),
        seconds: turn ? turn.seconds : (parsed.durationMs ?? 0) / 1000,
        context: turn ? turn.context : null,
        output: turn ? turn.output : null,
        cost: parsed.cost,
      } satisfies PaneRun;
    }
    runs.push(run);
  }

  const composed = composeCompare({
    promptFile: basename(promptFile),
    prompt,
    ...system,
    checks: cfg.checks,
    runs,
  });
  await Promise.all(Object.entries(composed.files).map(([name, content]) => Bun.write(join(dir, name), content)));
  return { verdicts: composed.verdicts };
}

export async function runCompare(argv: string[], env: Env = createEnv()): Promise<number> {
  const args = parseArgs(argv);
  if (args.core) return usage("--core was removed, use --system <file>");
  if (args.set ? args.promptFile !== undefined : !args.promptFile) return usage(USAGE.replace(/^usage: /, ""));
  if (!args.system) return usage(`--system <file> is required\n${USAGE}`);
  if (!Number.isInteger(args.runs) || args.runs < 1) return usage("--runs must be a positive integer");
  if (!args.print) return usage("interactive mode not built yet, use --print");

  const systemPath = args.system;
  const basePath = args.baseSystem ?? join(homedir(), ".claude", "AGENTS.md");
  if (!(await exists(systemPath))) return usage(`no such file: ${systemPath}`);
  if (!(await exists(basePath))) return usage(`no such file: ${basePath}`);

  const prompts: { file: string; name: string }[] = [];
  if (args.set) {
    const setDir = args.setDir ?? join(import.meta.dir, "..", "..", "compare", "prompts");
    const entries = await readdir(setDir).catch(() => null);
    if (!entries) return usage(`no such directory: ${setDir}`);
    for (const entry of entries.filter((e) => e.endsWith(".md")).sort()) {
      prompts.push({ file: join(setDir, entry), name: entry.replace(/\.md$/, "") });
    }
    if (prompts.length === 0) return usage(`no .md prompts in ${setDir}`);
  } else {
    const file = args.promptFile!;
    if (!(await exists(file))) return usage(`no such file: ${file}`);
    prompts.push({ file, name: "" });
  }

  const outDir = args.out ?? join(defaultStateDir(), "compare", timestampFolder(env.now()));
  const baseText = await readFile(basePath, "utf8");
  const bText = await readFile(systemPath, "utf8");
  const baseHash = sha256(baseText);
  const bHash = sha256(bText);
  await mkdir(join(outDir, "system"), { recursive: true });
  const baseCopy = join(outDir, "system", "base.md");
  const bCopy = join(outDir, "system", "b.md");
  await copyFile(basePath, baseCopy);
  await copyFile(systemPath, bCopy);
  await Bun.write(join(outDir, "system", "sha256.txt"), `${baseHash}  base.md\n${bHash}  b.md\n`);

  const cfg = await loadCompareConfig(process.env);
  const panes = paneCommands(cfg, { basePath: baseCopy, bPath: bCopy, model: args.model });
  const system = { basePath, baseHash, bPath: systemPath, bHash };

  const entries: SetEntry[] = [];
  for (const prompt of prompts) {
    const promptText = await readFile(prompt.file, "utf8");
    const dir = args.set ? join(outDir, prompt.name) : outDir;
    const outcome = await runPrompt(env, cfg, panes, prompt.file, promptText, args, dir, system);
    if (!outcome) return EXIT.failed;
    entries.push({ name: prompt.name, verdicts: outcome.verdicts });
  }
  if (args.set) await Bun.write(join(outDir, "index.md"), composeSetIndex(entries));

  process.stdout.write(`${outDir}\n`);
  return EXIT.ok;
}
