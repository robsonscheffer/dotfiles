// `mate-doc status [<path>]`: level, freshness, claim counts, open claims with owners. Without
// a path, reports on every remembered folder.
import { dirname } from "node:path";
import { stat } from "node:fs/promises";
import { audit } from "../audit/index.ts";
import { createEnv } from "../env.ts";
import { gate } from "../gate/index.ts";
import { loadLedger } from "../ledger/index.ts";
import { defaultStateDir, loadFolders } from "../serve/state.ts";
import { EXIT, type Env } from "../types.ts";

async function printStatusFor(target: string, env: Env): Promise<void> {
  const st = await stat(target).catch(() => null);
  if (!st) {
    process.stdout.write(`${target}: no such file or folder\n`);
    return;
  }
  const docDir = st.isDirectory() ? target : dirname(target);
  const gateResult = await gate(target, env);
  const auditResult = await audit(docDir, env);
  const ledger = await loadLedger(docDir);

  process.stdout.write(`${target}\n`);
  process.stdout.write(`  level: ${gateResult.levelBefore}\n`);
  process.stdout.write(`  fresh: ${auditResult.freshness.fresh}\n`);
  process.stdout.write(
    `  claims: ${gateResult.summary.claims} total, ${gateResult.summary.verified} verified, ` +
      `${gateResult.summary.open} open, ${gateResult.summary.stale} stale\n`,
  );
  for (const claim of ledger?.claims.filter((c) => c.status === "not_verified") ?? []) {
    process.stdout.write(`  open: ${claim.id} owner=${claim.owner ?? "unassigned"}\n`);
  }
}

export async function runStatus(argv: string[], env: Env = createEnv()): Promise<number> {
  const [target] = argv;
  if (target) {
    await printStatusFor(target, env);
    return EXIT.ok;
  }

  const stateDir = defaultStateDir();
  const { folders } = await loadFolders(stateDir);
  if (folders.length === 0) {
    process.stdout.write("mate-doc status: no remembered folders.\n");
    return EXIT.ok;
  }
  for (const folder of folders) await printStatusFor(folder.path, env);
  return EXIT.ok;
}
