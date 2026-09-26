// The one place publish computes a ledger hash, so it always matches what `approve` recorded.
import { ledgerHash } from "../ledger/index.ts";
import type { Doc, Ledger } from "../types.ts";

export function stableLedgerHash(docs: Doc[], ledger: Ledger | null, docDir: string): string {
  return ledgerHash(docs, ledger, docDir);
}
