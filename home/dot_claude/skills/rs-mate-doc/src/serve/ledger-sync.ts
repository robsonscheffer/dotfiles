// A synchronous ledger loader for the viewer: ServeOptions.loadLedger is sync (server.ts calls
// it inline while building a response), but src/ledger/index.ts's loadLedger is async (it reads
// through Bun.file). This mirrors that loader's logic with node:fs sync calls instead, without
// touching src/ledger/, which this lane does not own.
import { existsSync, readFileSync } from "node:fs";
import type { Claim, Ledger } from "../types.ts";

export function loadLedgerSync(docDir: string): Ledger | null {
  const path = `${docDir}/claims.yaml`;
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const parsed = Bun.YAML.parse(text) as { claims?: Claim[] } | null | undefined;
  const claims = parsed?.claims ?? [];
  return { path, claims };
}
