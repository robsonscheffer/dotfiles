// R1 to R11: findings that fire only above their threshold in thresholds.json.
// Every finding carries a confidence (D6), the sessions it rests on, an
// action, and the resume command for its worst session.

import { readFileSync } from "node:fs";
import { matchModel, priceTokens, type PricingTable } from "./pricing.ts";
import type {
  CacheBreakCause,
  CacheMetrics,
  ContextMetrics,
  Finding,
  FindingConfidence,
  OverheadMetrics,
  Session,
  Thread,
} from "./types.ts";

export interface Thresholds {
  r1_context_tokens: number;
  r2_span_hours: number;
  r2_turns: number;
  r3_peak_context_tokens: number;
  r4_idle_breaks_min: number;
  r5_model_switch_breaks_min: number;
  r6_unknown_breaks_min: number;
  r7_prompt_growth_tokens: number;
  r8_thinking_share_max: number;
  r9_catalog_share_max: number;
  r11_cache_1h_net_dollars_micro: number;
}

export function loadThresholds(path: string): Thresholds {
  return JSON.parse(readFileSync(path, "utf8")) as Thresholds;
}

const EDIT_TOOL_NAMES = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SONNET_5_ID = "claude-sonnet-5";
const EXCESS_CONTEXT_THRESHOLD = 150_000;

function resumeCommand(sessionId: string): string {
  return `claude --resume ${sessionId}`;
}

/** Sessions sorted by dollars descending; the first is "the worst one". */
function worstFirst(sessionIds: string[], sessionById: Map<string, Session>): string[] {
  return [...sessionIds].sort((a, b) => {
    const da = sessionById.get(a);
    const db = sessionById.get(b);
    const ad = (da?.mainDollars ?? 0) + (da?.subagentDollars ?? 0);
    const bd = (db?.mainDollars ?? 0) + (db?.subagentDollars ?? 0);
    return bd - ad;
  });
}

function makeFinding(opts: {
  rule: string;
  title: string;
  dollars: number;
  confidence: FindingConfidence;
  sessionIds: string[];
  action: string;
  sessionById: Map<string, Session>;
}): Finding {
  const ordered = worstFirst([...new Set(opts.sessionIds)], opts.sessionById);
  return {
    rule: opts.rule,
    title: opts.title,
    dollars: Math.round(opts.dollars),
    confidence: opts.confidence,
    sessionIds: ordered,
    action: opts.action,
    resumeCommand: ordered.length > 0 ? resumeCommand(ordered[0]!) : "",
  };
}

/** Per-session excess-context cost: tokens above 150K, priced at cache-read rate. */
function excessCostBySession(threads: Thread[], table: PricingTable): Map<string, number> {
  const byThreadId = new Map(threads.map((t) => [t.id, t]));
  const result = new Map<string, number>();
  for (const thread of threads) {
    if (thread.kind !== "main") continue;
    let cost = 0;
    for (const turn of thread.turns) {
      if (turn.promptSize <= EXCESS_CONTEXT_THRESHOLD) continue;
      const model = matchModel(table, turn.model);
      if (!model) continue;
      const rates = (turn.speed === "fast" && model.fast_usd_per_mtok) || model.usd_per_mtok;
      cost += (turn.promptSize - EXCESS_CONTEXT_THRESHOLD) * rates.cache_read;
    }
    result.set(thread.id, cost);
  }
  void byThreadId;
  return result;
}

function ruleR1(sessions: Session[], excessBySession: Map<string, number>, sessionById: Map<string, Session>): Finding | null {
  const hot = sessions.filter((s) => (excessBySession.get(s.mainThreadId) ?? 0) > 0);
  if (hot.length === 0) return null;
  const total = hot.reduce((a, s) => a + (excessBySession.get(s.mainThreadId) ?? 0), 0);
  return makeFinding({
    rule: "R1",
    title: `Heavy context above 150K (${hot.length} session${hot.length === 1 ? "" : "s"})`,
    dollars: total,
    confidence: "lower_bound",
    sessionIds: hot.map((s) => s.id),
    action: "Start a fresh session per task; compact before 150K; hand reading to a subagent",
    sessionById,
  });
}

function ruleR2(sessions: Session[], t: Thresholds, sessionById: Map<string, Session>): Finding | null {
  const long = sessions.filter((s) => s.spanHours > t.r2_span_hours || s.turns > t.r2_turns);
  if (long.length === 0) return null;
  const total = long.reduce((a, s) => a + (s.mainDollars ?? 0) + (s.subagentDollars ?? 0), 0);
  return makeFinding({
    rule: "R2",
    title: `Long-lived session (${long.length} session${long.length === 1 ? "" : "s"})`,
    dollars: total,
    confidence: "measured",
    sessionIds: long.map((s) => s.id),
    action: "Split work by task; resume with a short summary instead of the full history",
    sessionById,
  });
}

function ruleR3(
  sessions: Session[],
  t: Thresholds,
  excessBySession: Map<string, number>,
  sessionById: Map<string, Session>,
): Finding | null {
  const heavy = sessions.filter(
    (s) => s.peakContext > t.r3_peak_context_tokens && (s.subagentDollars ?? 0) === 0,
  );
  if (heavy.length === 0) return null;
  const total = heavy.reduce((a, s) => a + (excessBySession.get(s.mainThreadId) ?? 0), 0);
  return makeFinding({
    rule: "R3",
    title: `Heavy session with no helpers (${heavy.length} session${heavy.length === 1 ? "" : "s"})`,
    dollars: total,
    confidence: "lower_bound",
    sessionIds: heavy.map((s) => s.id),
    action: "Dispatch reading and search to a subagent",
    sessionById,
  });
}

function sessionIdForThread(threadId: string, threads: Thread[]): string | undefined {
  return threads.find((t) => t.id === threadId)?.sessionId;
}

function breakRule(
  rule: string,
  title: string,
  cache: CacheMetrics,
  cause: CacheBreakCause,
  minCount: number,
  threads: Thread[],
  sessionById: Map<string, Session>,
  action: string,
): Finding | null {
  const matches = cache.breaks.filter((b) => b.cause === cause);
  if (matches.length < minCount) return null;
  const dollars = matches.reduce((a, b) => a + b.dollars, 0);
  const sessionIds = matches
    .map((b) => sessionIdForThread(b.threadId, threads))
    .filter((id): id is string => Boolean(id));
  return makeFinding({
    rule,
    title: `${title} (${matches.length})`,
    dollars,
    confidence: "measured",
    sessionIds,
    action,
    sessionById,
  });
}

interface ImageGrowthHit {
  threadId: string;
  growth: number;
  remainingTurns: number;
  readRate: number;
}

function findImageGrowth(threads: Thread[], t: Thresholds, table: PricingTable): ImageGrowthHit[] {
  const hits: ImageGrowthHit[] = [];
  for (const thread of threads) {
    if (thread.images.length === 0) continue;
    for (const image of thread.images) {
      // The next turn in this thread after the image event, by timestamp.
      let nextIndex = -1;
      for (let i = 0; i < thread.turns.length; i += 1) {
        if (thread.turns[i]!.timestampMs >= image.timestampMs) {
          nextIndex = i;
          break;
        }
      }
      if (nextIndex < 1) continue; // no previous turn to diff against
      const curr = thread.turns[nextIndex]!;
      const prev = thread.turns[nextIndex - 1]!;
      const growth = curr.promptSize - prev.promptSize;
      if (growth <= t.r7_prompt_growth_tokens) continue;
      const model = matchModel(table, curr.model);
      if (!model) continue;
      const rates = (curr.speed === "fast" && model.fast_usd_per_mtok) || model.usd_per_mtok;
      const remainingTurns = thread.turns.length - nextIndex;
      hits.push({ threadId: thread.id, growth, remainingTurns, readRate: rates.cache_read });
    }
  }
  return hits;
}

function ruleR7(threads: Thread[], t: Thresholds, table: PricingTable, sessionById: Map<string, Session>): Finding | null {
  const hits = findImageGrowth(threads, t, table);
  if (hits.length === 0) return null;
  const dollars = hits.reduce((a, h) => a + h.growth * h.remainingTurns * h.readRate, 0);
  const sessionIds = hits
    .map((h) => sessionIdForThread(h.threadId, threads))
    .filter((id): id is string => Boolean(id));
  return makeFinding({
    rule: "R7",
    title: `Large images (${hits.length})`,
    dollars,
    confidence: "estimated",
    sessionIds,
    action: "Crop or resize screenshots before reading",
    sessionById,
  });
}

function ruleR8(
  threads: Thread[],
  sessions: Session[],
  t: Thresholds,
  table: PricingTable,
  sessionById: Map<string, Session>,
): Finding | null {
  const sonnet5 = table.models.find((m) => m.id === SONNET_5_ID);
  if (!sonnet5) return null;

  const hitSessions: Session[] = [];
  let dollars = 0;
  for (const session of sessions) {
    const main = threads.find((t2) => t2.id === session.mainThreadId);
    if (!main || main.turns.length === 0) continue;
    const isOpus = main.turns.every((turn) => turn.model.startsWith("claude-opus"));
    if (!isOpus) continue;
    const hasEditTool = main.turns.some((turn) => turn.toolUses.some((tu) => EDIT_TOOL_NAMES.has(tu.name)));
    if (hasEditTool) continue;
    const outputTokens = main.turns.reduce((a, turn) => a + turn.tokens.output, 0);
    const thinkingTokens = main.turns.reduce((a, turn) => a + (turn.thinkingTokens ?? 0), 0);
    const thinkingShare = outputTokens === 0 ? 0 : thinkingTokens / outputTokens;
    if (thinkingShare >= t.r8_thinking_share_max) continue;

    const actual = main.turns.reduce((a, turn) => a + (turn.dollars ?? 0), 0);
    const onSonnet = main.turns.reduce((a, turn) => {
      const rates = (turn.speed === "fast" && sonnet5.fast_usd_per_mtok) || sonnet5.usd_per_mtok;
      return a + priceTokens(turn.tokens, rates);
    }, 0);
    const delta = actual - onSonnet;
    if (delta <= 0) continue;
    dollars += delta;
    hitSessions.push(session);
  }

  if (hitSessions.length === 0) return null;
  return makeFinding({
    rule: "R8",
    title: `Opus on read-only work (${hitSessions.length} session${hitSessions.length === 1 ? "" : "s"})`,
    dollars,
    confidence: "estimated",
    sessionIds: hitSessions.map((s) => s.id),
    action: "Start read-only sessions on Sonnet",
    sessionById,
  });
}

function ruleR9(
  overhead: OverheadMetrics,
  sessions: Session[],
  t: Thresholds,
  sessionById: Map<string, Session>,
): Finding | null {
  if (overhead.firstTurnPromptSizeMedian === 0) return null;
  const share = overhead.catalogTokensEstimate / overhead.firstTurnPromptSizeMedian;
  if (share <= t.r9_catalog_share_max) return null;
  const worst = [...sessions].sort((a, b) => b.peakContext - a.peakContext).slice(0, 3);
  return makeFinding({
    rule: "R9",
    title: "Catalog overhead",
    dollars: overhead.catalogCostEstimate,
    confidence: "estimated",
    sessionIds: worst.map((s) => s.id),
    action: "Remove unused skills and plugins",
    sessionById,
  });
}

function ruleR10(threads: Thread[], sessionById: Map<string, Session>): Finding | null {
  const premiumSubagents = threads.filter(
    (thread) =>
      thread.kind === "subagent" &&
      !thread.pinnedModel &&
      thread.turns.some((turn) => turn.model.startsWith("claude-opus") || turn.model.startsWith("claude-fable")),
  );
  let unchangedRereads = 0;
  for (const thread of threads) {
    const seen = new Map<string, number>();
    for (const turn of thread.turns) {
      for (const tu of turn.toolUses) {
        if (tu.name !== "Read" || !tu.filePath) continue;
        seen.set(tu.filePath, (seen.get(tu.filePath) ?? 0) + 1);
      }
    }
    for (const count of seen.values()) {
      if (count > 1) unchangedRereads += count - 1;
    }
  }

  if (premiumSubagents.length === 0 && unchangedRereads === 0) return null;

  const dollars = premiumSubagents.reduce(
    (a, thread) => a + thread.turns.reduce((b, turn) => b + (turn.dollars ?? 0), 0),
    0,
  );
  const parts: string[] = [];
  if (premiumSubagents.length > 0) parts.push(`${premiumSubagents.length} unpinned subagent${premiumSubagents.length === 1 ? "" : "s"}`);
  if (unchangedRereads > 0) parts.push(`${unchangedRereads} repeat read${unchangedRereads === 1 ? "" : "s"}`);

  const sessionIds = premiumSubagents.map((t2) => t2.sessionId);
  return makeFinding({
    rule: "R10",
    title: `Small stuff: ${parts.join(", ")}`,
    dollars,
    confidence: "measured",
    sessionIds,
    action: "One line: pin model: on helpers; do not re-read unchanged files",
    sessionById,
  });
}

function ruleR11(cache: CacheMetrics, t: Thresholds, threads: Thread[], sessionById: Map<string, Session>): Finding | null {
  if (cache.payoff.netDollars <= t.r11_cache_1h_net_dollars_micro) return null;
  const sessionIds = Object.keys(cache.payoff.byThread)
    .map((threadId) => sessionIdForThread(threadId, threads))
    .filter((id): id is string => Boolean(id));
  return makeFinding({
    rule: "R11",
    title: "1-hour cache lifetime",
    dollars: cache.payoff.netDollars,
    confidence: "estimated",
    sessionIds,
    action:
      'Set "promptCacheTtl": "5m" in ~/.claude/settings.json (Claude Code 2.1.242+); subagents use subagentPromptCacheTtl.',
    sessionById,
  });
}

/** measured and lower_bound sort together by dollars descending; estimated sorts after, also by dollars descending. */
function confidenceGroup(confidence: FindingConfidence): number {
  return confidence === "estimated" ? 1 : 0;
}

export function evaluateRules(options: {
  threads: Thread[];
  sessions: Session[];
  context: ContextMetrics;
  cache: CacheMetrics;
  overhead: OverheadMetrics;
  table: PricingTable;
  thresholds: Thresholds;
}): Finding[] {
  const { threads, sessions, cache, overhead, table, thresholds } = options;
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const excessBySession = excessCostBySession(threads, table);

  const findings: (Finding | null)[] = [
    ruleR1(sessions, excessBySession, sessionById),
    ruleR2(sessions, thresholds, sessionById),
    ruleR3(sessions, thresholds, excessBySession, sessionById),
    breakRule(
      "R4",
      "Idle breaks rewrote big contexts",
      cache,
      "idle_expiry",
      thresholds.r4_idle_breaks_min,
      threads,
      sessionById,
      "Resume within the cache lifetime, or start fresh with a summary",
    ),
    breakRule(
      "R5",
      "Model switch breaks",
      cache,
      "model_switch",
      thresholds.r5_model_switch_breaks_min,
      threads,
      sessionById,
      "Pick the model at the start of the session",
    ),
    breakRule(
      "R6",
      "Unknown breaks",
      cache,
      "unknown",
      thresholds.r6_unknown_breaks_min,
      threads,
      sessionById,
      "Check for MCP reconnects or plugin reloads mid-session",
    ),
    ruleR7(threads, thresholds, table, sessionById),
    ruleR8(threads, sessions, thresholds, table, sessionById),
    ruleR9(overhead, sessions, thresholds, sessionById),
    ruleR10(threads, sessionById),
    ruleR11(cache, thresholds, threads, sessionById),
  ];

  return findings
    .filter((f): f is Finding => f !== null)
    .sort((a, b) => {
      const groupDiff = confidenceGroup(a.confidence) - confidenceGroup(b.confidence);
      if (groupDiff !== 0) return groupDiff;
      return b.dollars - a.dollars;
    });
}
