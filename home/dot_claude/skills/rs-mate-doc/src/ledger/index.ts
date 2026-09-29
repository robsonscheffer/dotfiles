// Ledger: load, validate, and hash claims.yaml.
import { createHash } from "node:crypto";
import { relative } from "node:path";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import schema from "../../schema/claims.schema.json";
import type { Claim, Doc, Frontmatter, Ledger } from "../types.ts";

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const validateSchema = ajv.compile(schema);

export function ledgerFilePath(docDir: string): string {
  return `${docDir}/claims.yaml`;
}

// Load claims.yaml from a doc's folder. Returns null when the file does not exist.
// Does not validate: use validateLedger for that.
export async function loadLedger(docDir: string): Promise<Ledger | null> {
  const path = ledgerFilePath(docDir);
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const text = await file.text();
  const parsed = Bun.YAML.parse(text) as { author?: string; claims?: Claim[] } | null | undefined;
  const claims = parsed?.claims ?? [];
  const ledger: Ledger = { path, claims };
  if (typeof parsed?.author === "string") ledger.author = parsed.author;
  return ledger;
}

export interface LedgerValidation {
  valid: boolean;
  errors: ErrorObject[];
}

// Validate a ledger's claims against schema/claims.schema.json.
export function validateLedger(ledger: Ledger): LedgerValidation {
  const ok = validateSchema(ledger.author === undefined ? { claims: ledger.claims } : { author: ledger.author, claims: ledger.claims });
  return { valid: ok, errors: ok ? [] : (validateSchema.errors ?? []) };
}

// sha256 hex of the claim text and its evidence only. Status, verdict, and checked fields are
// left out because recording a verdict changes them. A verdict is bound to this hash.
export function claimHash(claim: Pick<Claim, "claim" | "evidence">): string {
  return createHash("sha256")
    .update(canonicalize({ claim: claim.claim, evidence: claim.evidence ?? null }))
    .digest("hex");
}

// Deterministic JSON: object keys sorted recursively, arrays kept in order.
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sortKeys(v);
    return out;
  }
  return value;
}

const STRIPPED_FRONTMATTER_KEYS = ["status", "approved_by", "approved_at", "ledger_hash"] as const;

function strippedFrontmatter(fm: Frontmatter): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...fm, ...fm.extra };
  delete copy.extra;
  for (const key of STRIPPED_FRONTMATTER_KEYS) delete copy[key];
  return copy;
}

// Claim fields that record *when the claim was last checked*, not what it claims. Re-running a
// check (a fresh verdict, a new checked_at) is the world catching up, not a content change, and
// must not make an approved doc look different underneath its approval.
const STRIPPED_CLAIM_KEYS = ["verdict", "verdict_reason", "verdict_hash", "checked_by", "checked_at"] as const;

function strippedClaim(claim: Claim): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...claim };
  for (const key of STRIPPED_CLAIM_KEYS) delete copy[key];
  return copy;
}

// Removes every "pos" field, at any depth, from a parsed body. Positions are absolute file
// line/column: they shift whenever unrelated content earlier in the file changes line count
// (e.g. the frontmatter block growing when a doc is approved), even though nothing the reader
// sees moved. The hash should only change when the doc's actual content changes.
function stripPos(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPos);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === "pos") continue;
      out[key] = stripPos(v);
    }
    return out;
  }
  return value;
}

// sha256 of: each doc's (frontmatter stripped of status/approved_by/approved_at/ledger_hash,
// body stripped of position info), keyed by its path relative to docDir so moving or renaming
// the folder doesn't change the hash, ordered by that relative path; plus the ledger's claims,
// stripped of verdict/checked_by/checked_at (the "when last checked" metadata, not content).
export function ledgerHash(docs: Doc[], ledger: Ledger | null, docDir: string): string {
  const relPath = (doc: Doc): string => relative(docDir, doc.path);
  const ordered = [...docs].sort((a, b) => {
    const ra = relPath(a);
    const rb = relPath(b);
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });
  const pages = ordered.map((doc) => ({
    path: relPath(doc),
    frontmatter: strippedFrontmatter(doc.frontmatter),
    body: stripPos(doc.body),
  }));
  const claims = (ledger?.claims ?? []).map(strippedClaim);
  const payload = canonicalize(pages) + canonicalize(claims);
  return createHash("sha256").update(payload).digest("hex");
}
