// Lint: doc-shape rules plus ledger-shape rules, evaluated together.
import { readFileSync } from "node:fs";
import { validateLedger } from "../ledger/index.ts";
import { BADGE_RE, BADGE_TONES } from "../render/inline.ts";
import type {
  Block,
  ClaimRefNode,
  Doc,
  Inline,
  Ledger,
  LintIssue,
  Span,
} from "../types.ts";

const EM_DASH = "\u2014";
const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{10,}/, // AWS-shaped access key
  /sk-[a-zA-Z0-9]{20,}/, // generic secret-key-shaped token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /ghp_[a-zA-Z0-9]{20,}/, // github token-shaped
];
const PII_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // email
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN-shaped
  /\b(?:\d[ -]*?){13,19}\b/, // card-shaped
];
const PRIVATE_PATH_PATTERNS = ["wiki/", "projects/", "~/brain"];
const TONE_ATTR_RE = /tone\s*=\s*([a-zA-Z]+)/;

function collectText(nodes: Inline[]): { value: string; pos: Span }[] {
  const out: { value: string; pos: Span }[] = [];
  for (const node of nodes) {
    if (node.type === "text") out.push({ value: node.value, pos: node.pos });
    else if (node.type === "link") {
      out.push({ value: node.target, pos: node.pos });
      out.push(...collectText(node.children));
    } else if (node.type === "emphasis" || node.type === "strong") {
      out.push(...collectText(node.children));
    }
  }
  return out;
}

interface ParagraphInfo {
  hasClaimRef: boolean;
  hasNumberOrCode: boolean;
  texts: { value: string; pos: Span }[];
  pos: Span;
}

function collectParagraphs(blocks: Block[], out: ParagraphInfo[]): void {
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const hasClaimRef = block.children.some((c) => c.type === "claimRef");
      const hasCode = block.children.some((c) => c.type === "inlineCode");
      const texts = collectText(block.children);
      const hasNumber = texts.some((t) => /\d/.test(t.value));
      out.push({ hasClaimRef, hasNumberOrCode: hasCode || hasNumber, texts, pos: block.pos });
    } else if (block.type === "listItem" || block.type === "blockquote" || block.type === "directive" || block.type === "error") {
      collectParagraphs(block.children, out);
    } else if (block.type === "list") {
      collectParagraphs(block.children, out);
    }
  }
}

function collectClaimRefs(blocks: Block[], out: ClaimRefNode[]): void {
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "heading") {
      for (const child of block.children) if (child.type === "claimRef") out.push(child);
    } else if ("children" in block) {
      collectClaimRefs(block.children as Block[], out);
    }
  }
}

function walkDirectives(blocks: Block[], fn: (d: Extract<Block, { type: "directive" }>) => void): void {
  for (const block of blocks) {
    if (block.type === "directive") {
      fn(block);
      walkDirectives(block.children, fn);
    } else if ("children" in block) {
      walkDirectives(block.children as Block[], fn);
    }
  }
}

function lintDoc(doc: Doc, ledger: Ledger | null): LintIssue[] {
  const issues: LintIssue[] = [];
  const claimIds = new Set((ledger?.claims ?? []).map((c) => c.id));

  // parse-error
  for (const err of doc.errors) {
    issues.push({ rule: "parse-error", severity: "error", message: err.message, path: doc.path, pos: err.pos });
  }

  // claim-unresolved: a claimRef with no matching claim in the ledger.
  const refs: ClaimRefNode[] = [];
  collectClaimRefs(doc.body, refs);
  for (const ref of refs) {
    if (!claimIds.has(ref.id)) {
      issues.push({
        rule: "claim-unresolved",
        severity: "error",
        message: `{${ref.id}} has no matching claim in the ledger`,
        path: doc.path,
        pos: ref.pos,
        claim: ref.id,
      });
    }
  }

  // unknown-directive
  walkDirectives(doc.body, (d) => {
    if (!d.known) {
      issues.push({
        rule: "unknown-directive",
        severity: "error",
        message: `unknown directive :::${d.name}`,
        path: doc.path,
        pos: d.pos,
      });
    }
  });

  // text-level rules: em-dash, private-path, localhost-url, secret/pii (secrets/pii handled below for excerpts, not prose)
  const paragraphs: ParagraphInfo[] = [];
  collectParagraphs(doc.body, paragraphs);
  for (const p of paragraphs) {
    for (const t of p.texts) {
      if (t.value.includes(EM_DASH)) {
        issues.push({ rule: "em-dash", severity: "error", message: "em-dash in prose", path: doc.path, pos: t.pos });
      }
      if (PRIVATE_PATH_PATTERNS.some((pattern) => t.value.includes(pattern))) {
        issues.push({
          rule: "private-path",
          severity: "error",
          message: "private vault path leaked into a doc",
          path: doc.path,
          pos: t.pos,
        });
      }
      if (/localhost(:\d+)?/.test(t.value)) {
        issues.push({ rule: "localhost-url", severity: "error", message: "localhost URL in doc", path: doc.path, pos: t.pos });
      }
      // badge-tone: warn only, an unknown tone silently renders as neutral.
      if (t.value.includes(":badge[")) {
        BADGE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = BADGE_RE.exec(t.value))) {
          const attrs = m[2];
          const toneMatch = attrs ? TONE_ATTR_RE.exec(attrs) : null;
          const requested = toneMatch ? toneMatch[1]!.toLowerCase() : null;
          if (requested && !BADGE_TONES.has(requested)) {
            issues.push({
              rule: "badge-tone",
              severity: "warn",
              message: `badge tone "${requested}" is unknown and falls back to neutral`,
              path: doc.path,
              pos: t.pos,
            });
          }
        }
      }
    }
    // unclaimed-fact: warn only, a sentence with a number or code identifier and no claim ref.
    if (p.hasNumberOrCode && !p.hasClaimRef) {
      issues.push({
        rule: "unclaimed-fact",
        severity: "warn",
        message: "sentence has a number or code identifier with no claim reference",
        path: doc.path,
        pos: p.pos,
      });
    }
  }

  return issues;
}

// claims.yaml carries no position info out of Bun.YAML.parse, so recover a line number the
// cheap way: scan the raw text for the claim's own id and take the line it first appears on.
// Falls back to line 1 when the file cannot be read (e.g. a ledger built by hand in a test,
// with no file on disk) or the id isn't found verbatim.
function findLineForClaim(ledgerPath: string, claimId: string | undefined): Span {
  const fallback: Span = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
  if (!claimId) return fallback;
  let raw: string;
  try {
    raw = readFileSync(ledgerPath, "utf8");
  } catch {
    return fallback;
  }
  const idPattern = new RegExp(`["']?id["']?\\s*[:=]\\s*["']?${claimId}\\b`);
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (idPattern.test(lines[i] ?? "")) {
      return { start: { line: i + 1, column: 1 }, end: { line: i + 1, column: 1 } };
    }
  }
  return fallback;
}

function lintLedger(ledger: Ledger): LintIssue[] {
  const issues: LintIssue[] = [];
  const { valid, errors } = validateLedger(ledger);
  if (!valid) {
    for (const err of errors) {
      const claimIndexMatch = /^\/claims\/(\d+)/.exec(err.instancePath);
      const claim = claimIndexMatch ? ledger.claims[Number(claimIndexMatch[1])]?.id : undefined;
      const missing = (err.params as { missingProperty?: string }).missingProperty;
      const rule = missing === "owner" ? "not-verified-without-owner" : "claim-incomplete";
      issues.push({
        rule,
        severity: "error",
        message: `${err.instancePath || "/claims"} ${err.message ?? "is invalid"}`,
        path: ledger.path,
        pos: findLineForClaim(ledger.path, claim),
        claim,
      });
    }
  }

  for (const claim of ledger.claims) {
    if (claim.evidence) {
      const excerpt =
        claim.evidence.kind === "code" || claim.evidence.kind === "mcp"
          ? claim.evidence.excerpt
          : claim.evidence.kind === "link"
            ? claim.evidence.excerpt
            : undefined;
      if (excerpt) {
        if (SECRET_PATTERNS.some((pattern) => pattern.test(excerpt))) {
          issues.push({
            rule: "secret-in-excerpt",
            severity: "error",
            message: `evidence excerpt for ${claim.id} looks like a secret`,
            path: ledger.path,
            pos: findLineForClaim(ledger.path, claim.id),
            claim: claim.id,
          });
        }
        if (PII_PATTERNS.some((pattern) => pattern.test(excerpt))) {
          issues.push({
            rule: "pii-in-excerpt",
            severity: "error",
            message: `evidence excerpt for ${claim.id} looks like PII`,
            path: ledger.path,
            pos: findLineForClaim(ledger.path, claim.id),
            claim: claim.id,
          });
        }
      }
    }
  }

  return issues;
}

export function lint(docs: Doc[], ledger: Ledger | null): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const doc of docs) issues.push(...lintDoc(doc, ledger));
  if (ledger) issues.push(...lintLedger(ledger));
  return issues;
}
