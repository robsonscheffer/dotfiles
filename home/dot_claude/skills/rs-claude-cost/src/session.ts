// `rs-claude-cost session <id>`: one session, turn by turn, for looking into a finding.

import { detectCacheBreaks } from "./cache.ts";
import { normalize } from "./normalize.ts";
import { loadPricing, priceAllTurns } from "./pricing.ts";
import { findCandidateFiles } from "./scan.ts";

function usd(microDollars: number): string {
  return `$${(microDollars / 1_000_000).toFixed(2)}`;
}

export interface SessionOptions {
  root: string;
  pricingPath: string;
}

/** Returns the lines to print, or null when no transcript has that session id. */
export async function renderSession(id: string, options: SessionOptions): Promise<string[] | null> {
  const files = findCandidateFiles(options.root, 0).filter((f) => f.sessionId === id);
  if (files.length === 0) return null;

  const { threads } = await normalize(files, { startMs: 0, endMs: Number.POSITIVE_INFINITY });
  const table = loadPricing(options.pricingPath);
  priceAllTurns(table, threads.flatMap((t) => t.turns));
  const breaks = detectCacheBreaks(threads, table);
  const breakAt = new Map(breaks.map((b) => [`${b.threadId}@${b.timestamp}`, b]));

  const main = threads.find((t) => t.kind === "main");
  const subagents = threads.filter((t) => t.kind === "subagent");
  const lines: string[] = [];

  if (main) {
    const total = main.turns.reduce((a, t) => a + (t.dollars ?? 0), 0);
    lines.push(`session ${id} · ${main.turns.length} turns · ${usd(total)} main thread`);
    lines.push("  #  time (UTC)        model                context      cost  marker");
    main.turns.forEach((t, i) => {
      const b = breakAt.get(`${main.id}@${t.timestamp}`);
      const marker = [
        t.compactedSincePrevious ? "compaction" : "",
        b ? `break: ${b.cause.replace("_", " ")} ${usd(b.dollars)}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      lines.push(
        `${String(i + 1).padStart(3)}  ${t.timestamp.slice(5, 16).replace("T", " ")}  ${t.model.padEnd(20).slice(0, 20)}` +
          ` ${`${Math.round(t.promptSize / 1000)}K`.padStart(7)}  ${usd(t.dollars ?? 0).padStart(8)}  ${marker}`,
      );
    });
  }

  for (const sub of subagents) {
    const total = sub.turns.reduce((a, t) => a + (t.dollars ?? 0), 0);
    const peak = Math.max(0, ...sub.turns.map((t) => t.promptSize));
    lines.push(
      `subagent ${sub.agentType ?? "unknown"} (${sub.pinnedModel ?? "no pinned model"}) · ${sub.turns.length} turns` +
        ` · peak ${Math.round(peak / 1000)}K · ${usd(total)}`,
    );
  }

  return lines;
}
