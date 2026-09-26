// Gate: pass/fail a doc folder (or a single page), and drive level transitions.
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { audit } from "../audit/index.ts";
import { ledgerHash, loadLedger } from "../ledger/index.ts";
import { lint } from "../lint/index.ts";
import { parse } from "../parser/index.ts";
import type { Doc, Env, GateReasonItem, GateResult, Level, Span } from "../types.ts";

async function listMarkdownFiles(docDir: string): Promise<string[]> {
  const glob = new Bun.Glob("*.md");
  const names: string[] = [];
  for await (const name of glob.scan({ cwd: docDir })) names.push(name);
  return names.sort().map((name) => `${docDir}/${name}`);
}

async function loadDoc(mdPath: string): Promise<Doc> {
  const raw = await Bun.file(mdPath).text();
  return parse(raw, mdPath);
}

// Picks the doc that carries the folder's level/approval/hash frontmatter: index.md when
// present, else the first page alphabetically. Matches the ordering `build` uses for nav.
function primaryDoc(docs: Doc[]): Doc | undefined {
  return docs.find((d) => d.path.endsWith("/index.md")) ?? docs[0];
}

const FALLBACK_POS: Span = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };

// Points a gate reason at the claim's first {Cn} reference across every page in the gate run,
// so every reason carries a real file:line. Falls back to line 1 of the ledger/doc when the
// claim is never referenced in prose.
function posForClaim(docs: Doc[], claimId: string): Span {
  for (const doc of docs) {
    const ref = doc.claimRefs.find((r) => r.id === claimId);
    if (ref) return ref.pos;
  }
  return FALLBACK_POS;
}

function ttlExpiredClaimIds(freshnessStale: { claim: string; reason: string }[]): Set<string> {
  return new Set(freshnessStale.filter((s) => s.reason === "ttl").map((s) => s.claim));
}

export async function gate(target: string, env: Env): Promise<GateResult> {
  const st = await stat(target);
  const isFile = st.isFile();
  const docDir = isFile ? dirname(target) : target;
  const mdPaths = isFile ? [target] : await listMarkdownFiles(docDir);
  const docs = await Promise.all(mdPaths.map(loadDoc));
  const ledger = await loadLedger(docDir);

  const lintIssues = lint(docs, ledger);
  const auditResult = await audit(docDir, env);
  const expiredIds = ttlExpiredClaimIds(auditResult.freshness.stale);
  const checkByClaim = new Map(auditResult.checks.map((c) => [c.claim, c] as const));

  const doc = primaryDoc(docs);
  const path = ledger?.path ?? doc?.path ?? docDir;

  const lintReasons: GateReasonItem[] = lintIssues
    .filter((i) => i.severity === "error")
    .map((i) => ({
      kind: "lint",
      rule: i.rule,
      message: `${i.rule}: ${i.message}`,
      path: i.path,
      pos: i.pos ?? FALLBACK_POS,
      claim: i.claim,
    }));

  const claimReasons: GateReasonItem[] = [];
  for (const claim of ledger?.claims ?? []) {
    const pos = posForClaim(docs, claim.id);

    if (claim.status === "not_verified") {
      if (!claim.owner) {
        claimReasons.push({
          kind: "no-owner",
          message: `${claim.id} is not_verified with no owner`,
          path,
          pos,
          claim: claim.id,
        });
      }
      continue;
    }

    if (!claim.verdict) {
      claimReasons.push({
        kind: "no-verdict",
        message: `${claim.id} has no verdict yet`,
        path,
        pos,
        claim: claim.id,
      });
      continue;
    }

    if (claim.verdict !== "supports") {
      claimReasons.push({
        kind: "verdict-not-supports",
        message: `${claim.id} verdict is "${claim.verdict}", not "supports"`,
        path,
        pos,
        claim: claim.id,
      });
      continue;
    }

    if (expiredIds.has(claim.id)) {
      claimReasons.push({
        kind: "stale",
        message: `${claim.id} is stale: ttl_days elapsed`,
        path,
        pos,
        claim: claim.id,
      });
      continue;
    }

    if (claim.evidence?.kind === "mcp") continue; // ttl-fresh, human-verdicted, never runnable by design

    const check = checkByClaim.get(claim.id);
    if (!check || check.ran === false) {
      claimReasons.push({
        kind: "capability-missing",
        message: `${claim.id} has no runnable capability here, cannot be trusted`,
        path,
        pos,
        claim: claim.id,
      });
      continue;
    }
    if (check.ok !== true) {
      claimReasons.push({
        kind: "check-failed",
        message: `${claim.id} evidence check failed: ${check.detail}`,
        path,
        pos,
        claim: claim.id,
      });
    }
  }

  const reasons = [...lintReasons, ...claimReasons];
  const pass = reasons.length === 0;

  const levelBefore: Level = (doc?.frontmatter.status as Level | undefined) ?? "draft";
  const recordedHash = doc?.frontmatter.ledger_hash;
  const currentHash = docs.length > 0 ? ledgerHash(docs, ledger, docDir) : undefined;

  let levelAfter: Level;
  if (levelBefore === "official") {
    const hashChanged = recordedHash !== undefined && currentHash !== undefined && recordedHash !== currentHash;
    // World staleness (ttl, drift) never demotes an official doc on its own: only a hash
    // mismatch (the page itself changed underneath the approval) does.
    levelAfter = hashChanged ? (pass ? "audited" : "draft") : "official";
  } else {
    levelAfter = pass ? "audited" : "draft";
  }

  const claims = ledger?.claims.length ?? 0;
  const verified = ledger?.claims.filter((c) => c.status === "verified").length ?? 0;
  const open = new Set(claimReasons.map((r) => r.claim)).size;
  const stale = auditResult.freshness.stale.length;

  return { pass, levelBefore, levelAfter, reasons, summary: { claims, verified, open, stale } };
}
