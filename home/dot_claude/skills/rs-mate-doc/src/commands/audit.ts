// `mate-doc audit <path> [--json]`: run evidence checks with a real Env, report freshness and
// the verdict worklist.
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { audit } from "../audit/index.ts";
import { createEnv } from "../env.ts";
import { EXIT, type Env } from "../types.ts";

export async function runAudit(argv: string[], env: Env = createEnv()): Promise<number> {
  const [target, ...rest] = argv;
  if (!target) {
    process.stderr.write("mate-doc audit: usage: mate-doc audit <path> [--json]\n");
    return EXIT.usage;
  }
  const json = rest.includes("--json");

  const st = await stat(target).catch(() => null);
  if (!st) {
    process.stderr.write(`mate-doc audit: no such file or folder: ${target}\n`);
    return EXIT.usage;
  }
  const docDir = st.isDirectory() ? target : dirname(target);

  const result = await audit(docDir, env);

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return EXIT.ok;
  }

  process.stdout.write(`checks: ${result.checks.length}\n`);
  for (const c of result.checks) {
    process.stdout.write(`  ${c.claim} [${c.capability}] ${c.ran ? (c.ok ? "ok" : "fail") : "skipped"}: ${c.detail}\n`);
  }
  process.stdout.write(`fresh: ${result.freshness.fresh}\n`);
  for (const s of result.freshness.stale) {
    process.stdout.write(`  stale ${s.claim} (${s.reason}): ${s.detail}\n`);
  }
  process.stdout.write(`worklist: ${result.worklist.length}\n`);
  for (const w of result.worklist) {
    process.stdout.write(`  ${w.claim} [${w.reason}] needs ${w.needs}: ${w.source}\n`);
  }
  return EXIT.ok;
}
