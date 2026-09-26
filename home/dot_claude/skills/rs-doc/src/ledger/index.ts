// Ledger: load, validate, and hash claims.yaml.
import { createHash } from "node:crypto";
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
  const parsed = Bun.YAML.parse(text) as { claims?: Claim[] } | null | undefined;
  const claims = parsed?.claims ?? [];
  return { path, claims };
}

export interface LedgerValidation {
  valid: boolean;
  errors: ErrorObject[];
}

// Validate a ledger's claims against schema/claims.schema.json.
export function validateLedger(ledger: Ledger): LedgerValidation {
  const ok = validateSchema({ claims: ledger.claims });
  return { valid: ok, errors: ok ? [] : (validateSchema.errors ?? []) };
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

// sha256 of: each doc's (frontmatter stripped of status/approved_by/approved_at/ledger_hash)
// plus body, canonicalized, ordered by path; plus the canonicalized ledger claims.
export function ledgerHash(docs: Doc[], ledger: Ledger | null): string {
  const ordered = [...docs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const pages = ordered.map((doc) => ({
    path: doc.path,
    frontmatter: strippedFrontmatter(doc.frontmatter),
    body: doc.body,
  }));
  const payload = canonicalize(pages) + canonicalize(ledger?.claims ?? []);
  return createHash("sha256").update(payload).digest("hex");
}
