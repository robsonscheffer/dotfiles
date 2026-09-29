// `mate-doc compare <prompt-file> [--core <path>] [--out <dir>] [--runs N] [--model M]`: run the
// same prompt through an agent CLI with and without the core rules file appended as a system
// prompt, and write both outputs side by side.
//
// Base command comes from the `compare.command` config key (default `claude -p --safe-mode`);
// the with-core invocation appends the `compare.core_flag` flag (default
// `--append-system-prompt-file`) followed by `<core>`. `--model` is passed through to both when
// given. Every agent call goes through env.run so tests never spawn a real process.
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { loadCompareCommand, loadCompareCoreFlag } from "../compare/config.ts";
import { composeCompare, type CompareRun } from "../compare/render.ts";
import { createEnv } from "../env.ts";
import { defaultStateDir } from "../serve/state.ts";
import { EXIT, type Env } from "../types.ts";

const USAGE =
  "usage: mate-doc compare <prompt-file> [--core <path>] [--out <dir>] [--runs N] [--model M]";

interface ParsedArgs {
  promptFile?: string;
  core?: string;
  out?: string;
  runs: number;
  model?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { runs: 1 };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--core") out.core = argv[++i];
    else if (arg === "--out") out.out = argv[++i];
    else if (arg === "--runs") out.runs = Number(argv[++i]);
    else if (arg === "--model") out.model = argv[++i];
    else if (arg !== undefined) positional.push(arg);
  }
  out.promptFile = positional[0];
  return out;
}

function defaultCorePath(): string {
  return join(homedir(), ".claude", "AGENTS.md");
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

async function writeFilesTo(dir: string, files: Record<string, string>): Promise<void> {
  await Promise.all(Object.entries(files).map(([name, content]) => Bun.write(join(dir, name), content)));
}

export async function runCompare(argv: string[], env: Env = createEnv()): Promise<number> {
  const args = parseArgs(argv);
  if (!args.promptFile) {
    process.stderr.write(`mate-doc compare: ${USAGE}\n`);
    return EXIT.usage;
  }
  if (!Number.isInteger(args.runs) || args.runs < 1) {
    process.stderr.write(`mate-doc compare: --runs must be a positive integer\n`);
    return EXIT.usage;
  }

  const promptStat = await stat(args.promptFile).catch(() => null);
  if (!promptStat) {
    process.stderr.write(`mate-doc compare: no such file: ${args.promptFile}\n`);
    return EXIT.usage;
  }
  const prompt = await readFile(args.promptFile, "utf8");

  const corePath = args.core ?? defaultCorePath();
  const coreStat = await stat(corePath).catch(() => null);
  if (!coreStat) {
    process.stderr.write(`mate-doc compare: no such core file: ${corePath}\n`);
    return EXIT.env;
  }
  const coreText = await readFile(corePath, "utf8");
  const coreHash = createHash("sha256").update(coreText).digest("hex");

  const baseCommand = await loadCompareCommand(process.env);
  const coreFlag = await loadCompareCoreFlag(process.env);
  const modelArgs = args.model ? ["--model", args.model] : [];
  const withoutCmd = [...baseCommand, ...modelArgs];
  const withCmd = [...baseCommand, coreFlag, corePath, ...modelArgs];

  const runs: CompareRun[] = [];
  for (let i = 0; i < args.runs; i++) {
    const withoutResult = await env.run(withoutCmd, { input: prompt });
    if (withoutResult.code !== 0) {
      process.stderr.write(`mate-doc compare: ${withoutCmd.join(" ")} failed: ${describeFailure(withoutResult)}\n`);
      return EXIT.failed;
    }
    const withResult = await env.run(withCmd, { input: prompt });
    if (withResult.code !== 0) {
      process.stderr.write(`mate-doc compare: ${withCmd.join(" ")} failed: ${describeFailure(withResult)}\n`);
      return EXIT.failed;
    }
    runs.push({ without: withoutResult.stdout, with: withResult.stdout });
  }

  const outDir = args.out ?? join(defaultStateDir(), "compare", timestampFolder(env.now()));
  const composed = composeCompare({
    promptFile: basename(args.promptFile),
    prompt,
    corePath,
    coreHash,
    runs,
  });
  await writeFilesTo(outDir, composed.files);

  process.stdout.write(`${outDir}\n`);
  return EXIT.ok;
}
