// Stable ledger hash for publish's own use.
//
// The shared ledgerHash (src/ledger/index.ts, not ours to change) hashes each body node's
// absolute source position along with its content. Frontmatter length changes shift every
// position beneath it, so writing `ledger_hash` into frontmatter changes the very hash it
// records: the doc looks "changed" the instant it is approved. Strip positions before handing
// docs to the shared hash so publish's notion of "unchanged since approval" tracks content, not
// source offsets. A later wave changes ledgerHash itself to ignore positions (and absolute
// paths, and verdict/checked_by/checked_at); at that point this wrapper can call straight
// through. Every publish call into ledgerHash goes through this one helper.
import { ledgerHash as rawLedgerHash } from "../ledger/index.ts";
import type { Doc, Ledger } from "../types.ts";

function stripPos(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPos);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === "pos") continue;
      out[key] = stripPos(val);
    }
    return out;
  }
  return value;
}

export function stableLedgerHash(docs: Doc[], ledger: Ledger | null): string {
  const stripped = docs.map((doc) => stripPos(doc) as Doc);
  return rawLedgerHash(stripped, ledger);
}
