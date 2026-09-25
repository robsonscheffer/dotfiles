// Shared render context. Not part of the contract (src/types.ts) — internal to L2 only.

import type { Ledger, RenderOptions } from "../types.ts";

export interface TermEntry {
  term: string;
  tooltip: string;
}

export interface Ctx {
  ledger: Ledger | null;
  opts: RenderOptions;
  terms: Map<string, TermEntry>; // lowercased term -> entry, populated as collide blocks render
  idCounter: number;
}

export function createCtx(ledger: Ledger | null, opts: RenderOptions): Ctx {
  return { ledger, opts, terms: new Map(), idCounter: 0 };
}

export function nextId(ctx: Ctx, prefix: string): string {
  ctx.idCounter += 1;
  return `${prefix}-${ctx.idCounter}`;
}
