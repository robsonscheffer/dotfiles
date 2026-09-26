// `mate-doc approve <path>`: human only, never an agent. Marks a passing doc official.
import { readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { dirname } from "node:path";
import { createEnv } from "../env.ts";
import { gate } from "../gate/index.ts";
import { ledgerHash, loadLedger } from "../ledger/index.ts";
import { parse } from "../parser/index.ts";
import { collectMarkdownFiles, findPrimaryMarkdown, isoWithOffset, setFrontmatterFields } from "./shared.ts";
import { EXIT, type Env } from "../types.ts";

const AGENT_ENV_VARS = ["CLAUDECODE", "CODEX_SANDBOX", "MATE_DOC_AGENT"];

function agentDetected(): boolean {
  return AGENT_ENV_VARS.some((v) => process.env[v]);
}

async function gitUserName(env: Env): Promise<string> {
  const result = await env.run(["git", "config", "user.name"]);
  const name = result.stdout.trim();
  return name.length > 0 ? name : "unknown";
}

// The actual "mark it official" write, split out from runApprove so it's testable without the
// TTY/agent gate and the interactive prompt in front of it.
export async function writeApproval(target: string, isDir: boolean, env: Env): Promise<void> {
  const docDir = isDir ? target : dirname(target);
  const mdPath = isDir ? await findPrimaryMarkdown(target) : target;
  if (!mdPath) throw new Error("mate-doc approve: no markdown page found.");

  const approvedBy = await gitUserName(env);
  const approvedAt = isoWithOffset(new Date());

  const mdFiles = isDir ? await collectMarkdownFiles(target) : [mdPath];
  const docs = [];
  for (const f of mdFiles) docs.push(parse(await readFile(f, "utf8"), f));
  const ledger = await loadLedger(docDir);
  const hash = ledgerHash(docs, ledger, docDir);

  const raw = await readFile(mdPath, "utf8");
  const updated = setFrontmatterFields(raw, {
    status: "official",
    approved_by: approvedBy,
    approved_at: approvedAt,
    ledger_hash: hash,
  });
  await writeFile(mdPath, updated, "utf8");
}

export async function runApprove(argv: string[], env: Env = createEnv()): Promise<number> {
  const [target] = argv;
  if (!target) {
    process.stderr.write("mate-doc approve: usage: mate-doc approve <path>\n");
    return EXIT.usage;
  }

  if (!process.stdin.isTTY || agentDetected()) {
    process.stderr.write("mate-doc approve: a person must run this, not an agent.\n");
    return EXIT.failed;
  }

  const st = await stat(target).catch(() => null);
  if (!st) {
    process.stderr.write(`mate-doc approve: no such file or folder: ${target}\n`);
    return EXIT.usage;
  }

  const gateResult = await gate(target, env);
  if (!gateResult.pass) {
    process.stderr.write("mate-doc approve: gate is not passing, cannot approve.\n");
    return EXIT.failed;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Approve ${target} as official? [y/N] `);
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    process.stdout.write("mate-doc approve: cancelled.\n");
    return EXIT.ok;
  }

  try {
    await writeApproval(target, st.isDirectory(), env);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return EXIT.usage;
  }

  process.stdout.write(`mate-doc approve: ${target} is now official.\n`);
  return EXIT.ok;
}
