// mate-doc walk command entry point. Not wired into the CLI here - lane I1 owns src/cli.ts and
// wires `mate-doc walk` to runWalk. This file only has to export the entry point.
//
//   walk <pr-url> --inputs <dir> [--out <dir>]     compose a walk from agent output already on disk
//   walk <pr-url> --fetch-only --out <dir>          fetch and write the raw PR data for agents to read
//   walk submit <walk-dir> --approve|... [--yes]    post the walk's review to GitHub
//   walk close <walk-dir> --verdict <v>             record the verdict and run the close hook
//
// --inputs reads the same filenames the agent-output fixture uses: story.json, questions.json,
// risks.json, judgment.json, and optionally context.json / ticket-fit.json / comment-triage.json.
// This is a deliberate departure from rs-walk's own /tmp/walk-<pr>-*.json naming (see the result
// notes) - a mate-doc build never has a stable PR number to key /tmp filenames on before it has
// fetched the PR, so the caller-supplied --inputs directory is the unit instead.
//
// "submit" and "close" are dispatched here, on the literal first token, rather than in
// src/cli.ts: neither collides with a real PR reference (parsePrRef always requires a "/" or
// "#"), so `mate-doc walk` keeps its single entry point.
import { detectActor } from "../identity.ts";
import { EXIT } from "../types.ts";
import type { Env } from "../types.ts";
import { runWalkClose } from "./close.ts";
import { composeWalk } from "./compose.ts";
import { fetchPr, fetchPrComments, parsePrRef } from "./fetch.ts";
import { runWalkSubmit } from "./submit.ts";
import type { WalkInputs } from "./types.ts";

interface ParsedArgs {
  prRef?: string;
  inputsDir?: string;
  outDir?: string;
  fetchOnly: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { fetchOnly: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--inputs") out.inputsDir = argv[++i];
    else if (arg === "--out") out.outDir = argv[++i];
    else if (arg === "--fetch-only") out.fetchOnly = true;
    else if (arg !== undefined) positional.push(arg);
  }
  out.prRef = positional[0];
  return out;
}

async function writeFilesTo(dir: string, files: Record<string, string>): Promise<void> {
  await Promise.all(Object.entries(files).map(([name, content]) => Bun.write(`${dir}/${name}`, content)));
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  return JSON.parse(await file.text()) as T;
}

const USAGE = "usage: mate-doc walk <pr-url> --inputs <dir> [--out <dir>] | mate-doc walk <pr-url> --fetch-only --out <dir>";

export async function runWalk(argv: string[], env: Env): Promise<number> {
  if (argv[0] === "submit") return runWalkSubmit(argv.slice(1), env);
  if (argv[0] === "close") return runWalkClose(argv.slice(1), env);

  const args = parseArgs(argv);
  if (!args.prRef) {
    process.stderr.write(`mate-doc walk: ${USAGE}\n`);
    return EXIT.usage;
  }

  let ref: { repo: string; number: number };
  try {
    ref = parsePrRef(args.prRef);
  } catch (err) {
    process.stderr.write(`mate-doc walk: ${(err as Error).message}\n`);
    return EXIT.usage;
  }

  let fetched;
  try {
    fetched = await fetchPr(ref.repo, ref.number, env);
  } catch (err) {
    process.stderr.write(`mate-doc walk: ${(err as Error).message}\n`);
    return EXIT.env;
  }

  if (args.fetchOnly) {
    const outDir = args.outDir ?? `./walk-${ref.number}-fetch`;
    const comments = await fetchPrComments(ref.repo, ref.number, env);
    await writeFilesTo(outDir, {
      "meta.json": JSON.stringify(fetched.meta, null, 2),
      "body.txt": fetched.body,
      "diff.patch": fetched.diff,
      "files.txt": fetched.files.length > 0 ? `${fetched.files.join("\n")}\n` : "",
      "comments.json": JSON.stringify(comments, null, 2),
    });
    process.stdout.write(`${outDir}\n`);
    return EXIT.ok;
  }

  if (!args.inputsDir) {
    process.stderr.write(`mate-doc walk: --inputs <dir> is required unless --fetch-only. ${USAGE}\n`);
    return EXIT.usage;
  }

  const inputsDir = args.inputsDir;
  const story = await readJsonIfExists<WalkInputs["story"]>(`${inputsDir}/story.json`);
  const questions = await readJsonIfExists<WalkInputs["questions"]>(`${inputsDir}/questions.json`);
  const risks = await readJsonIfExists<WalkInputs["risks"]>(`${inputsDir}/risks.json`);
  const judgment = await readJsonIfExists<WalkInputs["judgment"]>(`${inputsDir}/judgment.json`);
  const context = await readJsonIfExists<WalkInputs["context"]>(`${inputsDir}/context.json`);
  const ticketFit = await readJsonIfExists<WalkInputs["ticketFit"]>(`${inputsDir}/ticket-fit.json`);
  const commentTriage = await readJsonIfExists<WalkInputs["commentTriage"]>(`${inputsDir}/comment-triage.json`);

  if (!story || !questions || !risks || !judgment) {
    process.stderr.write("mate-doc walk: --inputs directory must contain story.json, questions.json, risks.json, judgment.json\n");
    return EXIT.usage;
  }

  const inputs: WalkInputs = { story, questions, risks, judgment, context, ticketFit, commentTriage };
  const composed = composeWalk(fetched, inputs, { now: env.now(), author: detectActor() });
  for (const w of composed.warnings) process.stderr.write(`mate-doc walk: warning: ${w}\n`);

  const outDir = args.outDir ?? `./walk-${ref.number}`;
  await writeFilesTo(outDir, composed.files);
  process.stdout.write(`${outDir}\n`);
  return EXIT.ok;
}
