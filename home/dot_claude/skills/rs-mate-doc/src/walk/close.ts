// mate-doc walk close: records a walk's verdict in its own frontmatter, then runs the user's own
// bookkeeping hook. That bookkeeping (a learning note, a log line, a search re-index, a commit in
// the old tool) is personal and must not live in this public code - it is a shell command the
// user configures once, in walk.close_hook (src/config/index.ts), and mate-doc only calls it.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadWalkCloseHook, type ProcessEnvLike } from "../config/index.ts";
import { extractFrontmatter } from "../parser/frontmatter.ts";
import { EXIT, type Env } from "../types.ts";
import { parsePrRef } from "./fetch.ts";
import { shQuote } from "./shell-quote.ts";

export type WalkVerdict = "approved" | "changes-requested" | "commented" | "skipped";
const VERDICTS: readonly WalkVerdict[] = ["approved", "changes-requested", "commented", "skipped"];

interface CloseArgs {
  walkDir?: string;
  verdict?: WalkVerdict;
  notesFile?: string;
}

const USAGE = "usage: mate-doc walk close <walk-dir> --verdict approved|changes-requested|commented|skipped [--notes-file N]";

function isWalkVerdict(value: string | undefined): value is WalkVerdict {
  return VERDICTS.includes(value as WalkVerdict);
}

function parseArgs(argv: string[]): CloseArgs {
  const out: CloseArgs = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--verdict") {
      const value = argv[++i];
      if (isWalkVerdict(value)) out.verdict = value;
    } else if (arg === "--notes-file") out.notesFile = argv[++i];
    else if (arg !== undefined) positional.push(arg);
  }
  out.walkDir = positional[0];
  return out;
}

function yamlScalar(value: string): string {
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : JSON.stringify(value);
}

// Edits only the "verdict" and "closed" lines inside the frontmatter fence, so every other key,
// its order, and the whole body stay byte for byte - the same discipline as verdict.ts's
// claims.yaml editor (src/commands/verdict.ts), applied to a doc's own frontmatter instead.
export function applyCloseToFrontmatter(raw: string, verdict: WalkVerdict, closedDate: string): string {
  const { bodyStartLine } = extractFrontmatter(raw);
  if (bodyStartLine === 0) throw new Error("no frontmatter found");
  const lines = raw.split("\n");
  const closeIdx = bodyStartLine - 1; // index of the closing "---"
  const yamlLines = lines.slice(1, closeIdx);

  function setScalar(key: string, value: string, insertAfterKey: string): void {
    const re = new RegExp(`^${key}:\\s*.*$`);
    const idx = yamlLines.findIndex((l) => re.test(l));
    const newLine = `${key}: ${yamlScalar(value)}`;
    if (idx !== -1) {
      yamlLines[idx] = newLine;
      return;
    }
    const afterRe = new RegExp(`^${insertAfterKey}:\\s*.*$`);
    const afterIdx = yamlLines.findIndex((l) => afterRe.test(l));
    yamlLines.splice(afterIdx !== -1 ? afterIdx + 1 : yamlLines.length, 0, newLine);
  }

  setScalar("verdict", verdict, "pr");
  setScalar("closed", closedDate, "verdict");

  return [lines[0]!, ...yamlLines, ...lines.slice(closeIdx)].join("\n");
}

async function runHook(hook: string, env: Env, vars: Record<string, string>): Promise<{ code: number; output: string }> {
  const exports = Object.entries(vars)
    .map(([k, v]) => `${k}=${shQuote(v)}`)
    .join(" ");
  const result = await env.run(["sh", "-c", `${exports} ${hook}`]);
  return { code: result.code, output: result.stderr || result.stdout };
}

export async function runWalkClose(argv: string[], env: Env, procEnv: ProcessEnvLike = process.env): Promise<number> {
  const args = parseArgs(argv);
  if (!args.walkDir || !args.verdict) {
    process.stderr.write(`mate-doc walk close: ${USAGE}\n`);
    return EXIT.usage;
  }

  const indexPath = join(args.walkDir, "index.md");
  let raw: string;
  try {
    raw = await readFile(indexPath, "utf8");
  } catch {
    process.stderr.write(`mate-doc walk close: no such file: ${indexPath}\n`);
    return EXIT.usage;
  }

  const closedDate = env.now().toISOString().slice(0, 10);
  let updated: string;
  try {
    updated = applyCloseToFrontmatter(raw, args.verdict, closedDate);
  } catch (err) {
    process.stderr.write(`mate-doc walk close: ${(err as Error).message}\n`);
    return EXIT.usage;
  }
  await writeFile(indexPath, updated, "utf8");

  const { frontmatter } = extractFrontmatter(raw);
  const prField = typeof frontmatter.extra.pr === "string" ? frontmatter.extra.pr : "";
  let repo = "";
  let number = "";
  try {
    const ref = parsePrRef(prField);
    repo = ref.repo;
    number = String(ref.number);
  } catch {
    // no usable "pr" field: still close the walk, just report empty repo/number to the hook.
  }

  const hook = await loadWalkCloseHook(procEnv);
  if (!hook) {
    process.stdout.write(`mate-doc walk close: ${args.walkDir} -> ${args.verdict}\n`);
    return EXIT.ok;
  }

  const { code, output } = await runHook(hook, env, {
    MATE_DOC_WALK_DIR: args.walkDir,
    MATE_DOC_PR: number,
    MATE_DOC_REPO: repo,
    MATE_DOC_VERDICT: args.verdict,
    MATE_DOC_NOTES_FILE: args.notesFile ?? "",
  });
  if (code !== 0) {
    process.stderr.write(`mate-doc walk close: hook failed:\n${output}\n`);
    return EXIT.failed;
  }
  process.stdout.write(`mate-doc walk close: ${args.walkDir} -> ${args.verdict}\n`);
  return EXIT.ok;
}
