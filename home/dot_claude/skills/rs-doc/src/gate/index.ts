// Gate: pass/fail a doc folder, and drive level transitions.
//
// The real markdown parser is L1's job and hasn't landed yet. Gate still needs *some* Doc to
// hand to lint(), so this file carries a small private loader good enough to exercise lint's
// rules end to end against real files on disk. It is intentionally not the CommonMark AST: no
// nested lists, no tables. Swap it for the real Parse function once L1 lands; lint() and gate()
// themselves don't change.
import { audit } from "../audit/index.ts";
import { ledgerHash, loadLedger } from "../ledger/index.ts";
import { lint } from "../lint/index.ts";
import {
  DIRECTIVES,
  type ClaimId,
  type Doc,
  type Env,
  type Frontmatter,
  type GateResult,
  type Inline,
  type Level,
  type LintIssue,
} from "../types.ts";

const KNOWN_DIRECTIVES: Set<string> = new Set(DIRECTIVES as readonly string[]);
const KNOWN_FRONTMATTER_KEYS = new Set([
  "title",
  "type",
  "summary",
  "tags",
  "sources",
  "created",
  "updated",
  "status",
  "shape",
  "tour",
  "approved_by",
  "approved_at",
  "ledger_hash",
]);

async function findPrimaryMarkdownFile(docDir: string): Promise<string | null> {
  const indexPath = `${docDir}/index.md`;
  if (await Bun.file(indexPath).exists()) return indexPath;
  const glob = new Bun.Glob("*.md");
  for await (const name of glob.scan({ cwd: docDir })) {
    return `${docDir}/${name}`;
  }
  return null;
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; rest: string } {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!fmMatch) {
    return { frontmatter: { extra: {} }, rest: raw };
  }
  const yamlText = fmMatch[1] ?? "";
  const rest = raw.slice(fmMatch[0].length);
  const parsed = (Bun.YAML.parse(yamlText) as Record<string, unknown>) ?? {};
  const extra: Record<string, unknown> = {};
  const fm: Frontmatter = { extra };
  for (const [key, value] of Object.entries(parsed)) {
    if (KNOWN_FRONTMATTER_KEYS.has(key)) (fm as unknown as Record<string, unknown>)[key] = value;
    else extra[key] = value;
  }
  return { frontmatter: fm, rest };
}

// Minimal line-oriented body builder: paragraphs split on blank lines, {Cn} tokens become
// claimRefs, ":::name" lines become (unnested) directive markers. No lists, tables, or code
// fences beyond simple recognition.
function buildBody(rest: string): Pick<Doc, "body" | "headings" | "claimRefs" | "errors"> {
  const lines = rest.split("\n");
  const body: Doc["body"] = [];
  const headings: Doc["headings"] = [];
  const claimRefs: Doc["claimRefs"] = [];
  const errors: Doc["errors"] = [];

  const linePos = (lineNo: number) => ({ start: { line: lineNo, column: 1 }, end: { line: lineNo, column: 1 } });

  let paraLines: { text: string; lineNo: number }[] = [];
  const flushParagraph = () => {
    if (paraLines.length === 0) return;
    const first = paraLines[0]!;
    const text = paraLines.map((l) => l.text).join("\n");
    const claimPattern = /\{(C[0-9]+)\}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const kids: Inline[] = [];
    while ((match = claimPattern.exec(text))) {
      if (match.index > lastIndex) {
        kids.push({ type: "text", value: text.slice(lastIndex, match.index), pos: linePos(first.lineNo) });
      }
      const id = match[1] as ClaimId;
      const node = { type: "claimRef" as const, id, pos: linePos(first.lineNo) };
      kids.push(node);
      claimRefs.push(node);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      kids.push({ type: "text", value: text.slice(lastIndex), pos: linePos(first.lineNo) });
    }
    body.push({ type: "paragraph", children: kids, pos: linePos(first.lineNo) });
    paraLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    const directiveMatch = /^:::([a-zA-Z][a-zA-Z0-9-]*)/.exec(line.trim());
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    if (headingMatch) {
      flushParagraph();
      const level = (headingMatch[1] as string).length as 1 | 2 | 3 | 4 | 5 | 6;
      const text = headingMatch[2] ?? "";
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      headings.push({ level, id, text, pos: linePos(lineNo) });
      body.push({
        type: "heading",
        level,
        id,
        children: [{ type: "text", value: text, pos: linePos(lineNo) }],
        pos: linePos(lineNo),
      });
      continue;
    }
    if (directiveMatch && line.trim() !== ":::") {
      flushParagraph();
      const name = (directiveMatch[1] as string).toLowerCase();
      body.push({
        type: "directive",
        name,
        known: KNOWN_DIRECTIVES.has(name),
        args: line.trim().slice(directiveMatch[0].length).trim().split(/\s+/).filter(Boolean),
        children: [],
        pos: linePos(lineNo),
      });
      continue;
    }
    paraLines.push({ text: line, lineNo });
  }
  flushParagraph();

  return { body, headings, claimRefs, errors };
}

export async function loadDocFromDisk(mdPath: string): Promise<Doc> {
  const raw = await Bun.file(mdPath).text();
  const { frontmatter, rest } = parseFrontmatter(raw);
  const { body, headings, claimRefs, errors } = buildBody(rest);
  return { path: mdPath, frontmatter, body, headings, claimRefs, errors };
}

function ttlExpiredClaimIds(freshnessStale: { claim: string; reason: string }[]): Set<string> {
  return new Set(freshnessStale.filter((s) => s.reason === "ttl").map((s) => s.claim));
}

const FALLBACK_POS = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };

// Point a gate reason at the claim's first {Cn} reference in the page, so every reason carries
// a real file:line. Falls back to line 1 of the page (or the folder itself, with no doc) when
// the claim is never referenced in prose.
function posForClaim(doc: Doc | null, claimId: string) {
  const ref = doc?.claimRefs.find((r) => r.id === claimId);
  return ref?.pos ?? FALLBACK_POS;
}

export async function gate(docDir: string, env: Env): Promise<GateResult> {
  const mdPath = await findPrimaryMarkdownFile(docDir);
  const doc = mdPath ? await loadDocFromDisk(mdPath) : null;
  const ledger = await loadLedger(docDir);
  const docs = doc ? [doc] : [];

  const lintIssues = lint(docs, ledger);
  const auditResult = await audit(docDir, env);
  const expiredIds = ttlExpiredClaimIds(auditResult.freshness.stale);
  const checkByClaim = new Map(auditResult.checks.map((c) => [c.claim, c] as const));

  const claimReasons: LintIssue[] = [];
  const path = ledger?.path ?? mdPath ?? docDir;
  for (const claim of ledger?.claims ?? []) {
    if (claim.status === "not_verified") {
      if (!claim.owner) {
        claimReasons.push({
          rule: "not-verified-without-owner",
          severity: "error",
          message: `${claim.id} is not_verified with no owner`,
          path,
          pos: posForClaim(doc, claim.id),
          claim: claim.id,
        });
      }
      continue;
    }

    if (claim.verdict !== "supports") {
      claimReasons.push({
        rule: "claim-incomplete",
        severity: "error",
        message: `${claim.id} has no fresh "supports" verdict`,
        path,
        pos: posForClaim(doc, claim.id),
        claim: claim.id,
      });
      continue;
    }

    if (expiredIds.has(claim.id)) {
      claimReasons.push({
        rule: "claim-incomplete",
        severity: "error",
        message: `${claim.id} is stale: ttl_days elapsed`,
        path,
        pos: posForClaim(doc, claim.id),
        claim: claim.id,
      });
      continue;
    }

    if (claim.evidence?.kind === "mcp") continue; // ttl-fresh, human-verdicted, never runnable by design

    const check = checkByClaim.get(claim.id);
    if (!check || check.ran === false) {
      claimReasons.push({
        rule: "claim-incomplete",
        severity: "error",
        message: `${claim.id} has no runnable capability here, cannot be trusted`,
        path,
        pos: posForClaim(doc, claim.id),
        claim: claim.id,
      });
      continue;
    }
    if (check.ok !== true) {
      claimReasons.push({
        rule: "claim-incomplete",
        severity: "error",
        message: `${claim.id} evidence check failed: ${check.detail}`,
        path,
        pos: posForClaim(doc, claim.id),
        claim: claim.id,
      });
    }
  }

  const lintErrors = lintIssues.filter((i) => i.severity === "error");
  const reasons = [...lintErrors, ...claimReasons];
  const pass = reasons.length === 0;

  const levelBefore: Level = (doc?.frontmatter.status as Level | undefined) ?? "draft";
  const recordedHash = doc?.frontmatter.ledger_hash;
  const currentHash = docs.length > 0 ? ledgerHash(docs, ledger) : undefined;

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
