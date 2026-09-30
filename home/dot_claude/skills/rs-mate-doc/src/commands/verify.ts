// `mate-doc verify <folder> [--claims C1,C3] [--model M] [--dry-run]`
//
// The one path that may mark a claim as passing without a person: a fresh agent judges each
// claim from the claim text and evidence mate-doc fetched itself, and the answer is written
// with `checked_by: verifier:<model>` and a hash of what was judged.
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isIndependent } from "../identity.ts";
import { claimHash, loadLedger } from "../ledger/index.ts";
import { EXIT, type Claim, type Env } from "../types.ts";
import { DEFAULT_MODEL } from "../verify/constants.ts";
import { askVerifier, buildArgv, loadVerifyConfig, prepareClaim } from "../verify/run.ts";
import { writeVerdict } from "./verdict.ts";

const USAGE = "mate-doc verify: usage: mate-doc verify <folder> [--claims C1,C3] [--model M] [--dry-run]\n";

function needsCheck(claim: Claim, author: string | undefined): boolean {
  if (claim.status === "proposed" || claim.status === "inferred") return true;
  if (!claim.verdict) return true;
  if (claim.verdict_hash !== claimHash(claim)) return true;
  return !isIndependent(claim.checked_by, author);
}

export async function runVerify(argv: string[], env: Env): Promise<number> {
  const args = [...argv];
  let claimsArg: string | undefined;
  let modelFlag: string | undefined;
  let dryRun = false;
  let path: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--claims" || a === "--model") {
      const v = args[++i];
      if (v === undefined) {
        process.stderr.write(USAGE);
        return EXIT.usage;
      }
      if (a === "--claims") claimsArg = v;
      else modelFlag = v;
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a.startsWith("--")) {
      process.stderr.write(`mate-doc verify: unknown flag ${a}\n`);
      return EXIT.usage;
    } else if (path === undefined) {
      path = a;
    } else {
      process.stderr.write(USAGE);
      return EXIT.usage;
    }
  }
  if (!path) {
    process.stderr.write(USAGE);
    return EXIT.usage;
  }

  const st = await stat(path).catch(() => null);
  if (!st) {
    process.stderr.write(`mate-doc verify: no such file or folder: ${path}\n`);
    return EXIT.usage;
  }
  const docDir = st.isDirectory() ? path : dirname(path);
  const ledgerPath = join(docDir, "claims.yaml");
  const ledger = await loadLedger(docDir);
  if (!ledger) {
    process.stderr.write(`mate-doc verify: no claims.yaml in ${docDir}\n`);
    return EXIT.usage;
  }

  let selected: Claim[];
  if (claimsArg !== undefined) {
    const ids = claimsArg.split(",").map((s) => s.trim()).filter(Boolean);
    const unknown = ids.filter((id) => !ledger.claims.some((c) => c.id === id));
    if (ids.length === 0 || unknown.length > 0) {
      process.stderr.write(`mate-doc verify: unknown claim ${unknown.join(", ") || claimsArg}\n`);
      return EXIT.usage;
    }
    selected = ledger.claims.filter((c) => ids.includes(c.id));
  } else {
    selected = ledger.claims.filter((c) => c.evidence && needsCheck(c, ledger.author));
  }

  if (ledger.author === undefined) {
    process.stdout.write(
      "mate-doc verify: ledger has no author; the gate will fail it (no-author) until one is set.\n",
    );
  }
  if (selected.length === 0) {
    process.stdout.write("mate-doc verify: nothing to check\n");
    return EXIT.ok;
  }

  const config = await loadVerifyConfig();
  const argvForAgent = buildArgv(config, modelFlag);
  const fallbackModel = modelFlag ?? config.model ?? DEFAULT_MODEL;
  const checkedAt = env.now().toISOString().slice(0, 10);
  let allSupport = true;

  for (const claim of selected) {
    if (!claim.evidence) {
      process.stdout.write(`${claim.id} needs evidence\n`);
      allSupport = false;
      continue;
    }
    const prepared = await prepareClaim(claim, env, docDir);
    if (prepared.kind === "drift") {
      process.stdout.write(`${claim.id} drift\n`);
      allSupport = false;
      continue;
    }
    if (prepared.kind === "needs-human") {
      process.stdout.write(`${claim.id} needs a human verdict\n`);
      allSupport = false;
      continue;
    }
    if (prepared.kind === "error") {
      process.stdout.write(`${claim.id} verifier-error: ${prepared.detail}\n`);
      allSupport = false;
      continue;
    }

    if (dryRun) {
      process.stdout.write(`${claim.id} would run: ${JSON.stringify(argvForAgent)}\n${prepared.prompt}\n`);
      continue;
    }

    const judged = await askVerifier(prepared.prompt, prepared.window, prepared.raw, argvForAgent, fallbackModel, env);
    if (judged.kind === "error") {
      process.stdout.write(`${claim.id} verifier-error: ${judged.detail}\n`);
      allSupport = false;
      continue;
    }
    if (judged.kind === "quote-missing") {
      process.stdout.write(`${claim.id} verifier-quote-missing\n`);
      allSupport = false;
      continue;
    }

    const raw = await readFile(ledgerPath, "utf8");
    const updated = writeVerdict(
      raw,
      claim.id,
      {
        verdict: judged.verdict,
        verdictReason: judged.reason,
        checkedBy: `verifier:${judged.modelId}`,
        checkedAt,
        status: judged.verdict === "supports" ? "verified" : undefined,
      },
      claim.status,
    );
    await writeFile(ledgerPath, updated, "utf8");
    if (judged.verdict === "supports") {
      process.stdout.write(`${claim.id} supports\n`);
    } else {
      allSupport = false;
      process.stdout.write(`${claim.id} ${judged.verdict}: ${judged.reason}\n`);
    }
  }

  if (dryRun) return EXIT.ok;
  return allSupport ? EXIT.ok : EXIT.failed;
}
