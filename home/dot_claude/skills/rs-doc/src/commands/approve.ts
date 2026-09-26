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

  const docDir = st.isDirectory() ? target : dirname(target);
  const mdPath = st.isDirectory() ? await findPrimaryMarkdown(target) : target;
  if (!mdPath) {
    process.stderr.write("mate-doc approve: no markdown page found.\n");
    return EXIT.usage;
  }

  const approvedBy = await gitUserName(env);
  const approvedAt = isoWithOffset(new Date());

  // ledgerHash hashes each doc's body with absolute file positions, and those shift with the
  // frontmatter block's own line count. So the hash must be computed against the *final*
  // frontmatter (the one left on disk), not the pre-approval one: write the final frontmatter
  // first with a same-length placeholder for ledger_hash, parse that, compute the hash, then
  // swap the placeholder text for the real hash in place (same line, no further line-count
  // change, so positions don't move again after the hash is computed).
  const placeholder = "0".repeat(64);
  const rawBefore = await readFile(mdPath, "utf8");
  const withPlaceholder = setFrontmatterFields(rawBefore, {
    status: "official",
    approved_by: approvedBy,
    approved_at: approvedAt,
    ledger_hash: placeholder,
  });
  await writeFile(mdPath, withPlaceholder, "utf8");

  const mdFiles = st.isDirectory() ? await collectMarkdownFiles(target) : [mdPath];
  const docs = [];
  for (const f of mdFiles) docs.push(parse(await readFile(f, "utf8"), f));
  const ledger = await loadLedger(docDir);
  const hash = ledgerHash(docs, ledger);

  const finalText = (await readFile(mdPath, "utf8")).replace(placeholder, hash);
  await writeFile(mdPath, finalText, "utf8");

  process.stdout.write(`mate-doc approve: ${target} is now official.\n`);
  return EXIT.ok;
}
