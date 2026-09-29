// mate-doc walk submit: posts a walk's review to GitHub via `gh pr review`. Defaults to a dry
// run - print exactly what would be posted and the exact command, post nothing - because this is
// the one walk step that reaches outside the local machine. --yes is required to actually call
// gh, so a human sees the body and command first and gives the go-ahead.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractFrontmatter } from "../parser/frontmatter.ts";
import { EXIT, type Env } from "../types.ts";
import { parsePrRef, type PrRef } from "./fetch.ts";
import { shQuote } from "./shell-quote.ts";

export type ReviewMode = "approve" | "request-changes" | "comment";

const MODE_FLAGS: Record<ReviewMode, string> = {
  approve: "--approve",
  "request-changes": "--request-changes",
  comment: "--comment",
};

interface SubmitArgs {
  walkDir?: string;
  mode?: ReviewMode;
  bodyFile?: string;
  notesFile?: string;
  yes: boolean;
}

const USAGE = "usage: mate-doc walk submit <walk-dir> --approve | --request-changes | --comment [--body-file F] [--notes-file N] [--yes]";

function parseArgs(argv: string[]): SubmitArgs {
  const out: SubmitArgs = { yes: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--approve") out.mode = "approve";
    else if (arg === "--request-changes") out.mode = "request-changes";
    else if (arg === "--comment") out.mode = "comment";
    else if (arg === "--body-file") out.bodyFile = argv[++i];
    else if (arg === "--notes-file") out.notesFile = argv[++i];
    else if (arg === "--yes") out.yes = true;
    else if (arg !== undefined) positional.push(arg);
  }
  out.walkDir = positional[0];
  return out;
}

// Notes are `{ section: text }`, rendered as one short bullet per section and appended after the
// body-file text.
export async function buildReviewBody(bodyFile?: string, notesFile?: string): Promise<string> {
  const parts: string[] = [];
  if (bodyFile) parts.push((await readFile(bodyFile, "utf8")).trim());
  if (notesFile) {
    const notes = JSON.parse(await readFile(notesFile, "utf8")) as Record<string, string>;
    const lines = Object.entries(notes).map(([section, text]) => `- ${section}: ${text}`);
    if (lines.length > 0) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

async function readWalkPr(walkDir: string): Promise<PrRef> {
  const raw = await readFile(join(walkDir, "index.md"), "utf8");
  const { frontmatter } = extractFrontmatter(raw);
  const pr = frontmatter.extra.pr;
  if (typeof pr !== "string" || pr.length === 0) {
    throw new Error(`${walkDir}/index.md has no "pr" field in its frontmatter`);
  }
  return parsePrRef(pr);
}

export function buildReviewCommand(ref: PrRef, mode: ReviewMode, body: string): string[] {
  const cmd = ["gh", "pr", "review", String(ref.number), "--repo", ref.repo, MODE_FLAGS[mode]];
  if (body.length > 0) cmd.push("--body", body);
  return cmd;
}

export async function runWalkSubmit(argv: string[], env: Env): Promise<number> {
  const args = parseArgs(argv);
  if (!args.walkDir || !args.mode) {
    process.stderr.write(`mate-doc walk submit: ${USAGE}\n`);
    return EXIT.usage;
  }

  let ref: PrRef;
  try {
    ref = await readWalkPr(args.walkDir);
  } catch (err) {
    process.stderr.write(`mate-doc walk submit: ${(err as Error).message}\n`);
    return EXIT.usage;
  }

  const body = await buildReviewBody(args.bodyFile, args.notesFile);
  const cmd = buildReviewCommand(ref, args.mode, body);

  if (!args.yes) {
    process.stdout.write(`Would post to ${ref.repo}#${ref.number} (${MODE_FLAGS[args.mode]}):\n\n`);
    process.stdout.write(body.length > 0 ? `${body}\n\n` : "(no body)\n\n");
    process.stdout.write(`Command: ${cmd.map(shQuote).join(" ")}\n`);
    return EXIT.ok;
  }

  const result = await env.run(cmd);
  if (result.code !== 0) {
    process.stderr.write(result.stderr || result.stdout || "mate-doc walk submit: gh pr review failed\n");
    return EXIT.failed;
  }
  process.stdout.write(`mate-doc walk submit: posted ${MODE_FLAGS[args.mode]} to ${ref.repo}#${ref.number}\n`);
  return EXIT.ok;
}
