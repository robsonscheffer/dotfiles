// Gate: pass/fail a doc folder (or a single page), and drive level transitions.
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { audit } from "../audit/index.ts";
import { isIndependent } from "../identity.ts";
import { claimHash, ledgerHash, loadLedger } from "../ledger/index.ts";
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

const INTEGRITY_REASONS = new Set<GateReasonItem["kind"]>([
  "no-author",
  "verdict-not-independent",
  "verdict-stale",
  "mcp-needs-human",
]);

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
  if (ledger && (!ledger.author || ledger.author.startsWith("TODO"))) {
    claimReasons.push({
      kind: "no-author",
      message: ledger.author
        ? `ledger author "${ledger.author}" is a placeholder, not a real author`
        : "ledger has no author",
      path,
      pos: FALLBACK_POS,
    });
  }
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
      } else if (claim.owner.startsWith("TODO")) {
        // A placeholder left over from a shape skeleton is not an owner: nobody named "TODO"
        // is going to answer for this claim.
        claimReasons.push({
          kind: "no-owner",
          message: `${claim.id} owner "${claim.owner}" is a placeholder, not a real owner`,
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

    if (!isIndependent(claim.checked_by, ledger?.author)) {
      claimReasons.push({
        kind: "verdict-not-independent",
        message: `${claim.id} verdict was not given by an independent checker (checked_by: ${claim.checked_by ?? "none"})`,
        path,
        pos,
        claim: claim.id,
      });
      continue;
    }

    if (!claim.verdict_hash || claim.verdict_hash !== claimHash(claim)) {
      claimReasons.push({
        kind: "verdict-stale",
        message: `${claim.id} changed since its verdict was recorded`,
        path,
        pos,
        claim: claim.id,
      });
      continue;
    }

    if (claim.evidence?.kind === "mcp" && !claim.checked_by?.startsWith("human:")) {
      claimReasons.push({
        kind: "mcp-needs-human",
        message: `${claim.id} uses mcp evidence, so its verdict must come from a human`,
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
    // mismatch (the page itself changed underneath the approval) does. The exception is an
    // integrity failure (no author, non-independent or stale verdict, mcp without a human),
    // which drops the doc to draft even when the hash is unchanged.
    const integrityFailed = reasons.some((r) => INTEGRITY_REASONS.has(r.kind));
    levelAfter = integrityFailed ? "draft" : hashChanged ? (pass ? "audited" : "draft") : "official";
  } else {
    levelAfter = pass ? "audited" : "draft";
  }

  const claims = ledger?.claims.length ?? 0;
  const failedClaims = new Set([...lintReasons, ...claimReasons].map((r) => r.claim).filter((id) => id !== undefined));
  const verified =
    ledger?.claims.filter((c) => c.status === "verified" && !failedClaims.has(c.id)).length ?? 0;
  // "open" means the same thing here and in `status`: a not_verified claim, full stop, not
  // "however many distinct claims currently have a failing gate reason" (those overlap, but
  // a not_verified claim with a real owner is still open even when it isn't a gate failure).
  const open = ledger?.claims.filter((c) => c.status === "not_verified").length ?? 0;
  const stale = auditResult.freshness.stale.length;

  return { pass, levelBefore, levelAfter, reasons, summary: { claims, verified, open, stale } };
}
