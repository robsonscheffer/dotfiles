// Shared types for rs-claude-cost. Money is always integer micro-dollars
// (1 USD = 1_000_000 micro-dollars) to avoid floating point drift.

export type MicroDollars = number;

export type TokenKind =
  | "input"
  | "cache_read"
  | "cache_write_5m"
  | "cache_write_1h"
  | "output";

export interface TokenCounts {
  input: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  output: number;
}

export function emptyTokenCounts(): TokenCounts {
  return {
    input: 0,
    cache_read: 0,
    cache_write_5m: 0,
    cache_write_1h: 0,
    output: 0,
  };
}

export interface ToolUse {
  name: string;
  filePath?: string;
}

export interface ImageEvent {
  toolUseId?: string;
  bytes?: number;
  displayWidth?: number;
  displayHeight?: number;
}

export interface Turn {
  /** message.id, shared by every content-block line that forms one request. */
  messageId: string;
  threadId: string;
  timestamp: string;
  timestampMs: number;
  model: string;
  /** "<synthetic>" turns are dropped before this type is constructed. */
  speed: "standard" | "fast";
  effort?: string;
  cwd?: string;
  gitBranch?: string;
  tokens: TokenCounts;
  /** uncached input + cache write (5m + 1h) + cache read */
  promptSize: number;
  compactedSincePrevious: boolean;
  toolUses: ToolUse[];
  images: ImageEvent[];
  /** filled in by pricing.ts */
  dollars?: MicroDollars;
  priced?: boolean;
  /** usage.output_tokens_details.thinking_tokens, for R8's thinking share */
  thinkingTokens?: number;
}

export type EventType = "compaction" | "skill_listing";

export interface CompactionEvent {
  type: "compaction";
  threadId: string;
  timestamp: string;
  timestampMs: number;
  trigger: "manual" | "auto" | string;
  preTokens?: number;
  postTokens?: number;
}

export interface SkillListingEvent {
  type: "skill_listing";
  threadId: string;
  timestamp: string;
  timestampMs: number;
  skillCount: number;
  bytes: number;
}

export type ThreadEvent = CompactionEvent | SkillListingEvent;

export interface Thread {
  id: string;
  kind: "main" | "subagent";
  /** own id for main threads, parent's session id for subagents */
  sessionId: string;
  parentSessionId?: string;
  agentType?: string;
  pinnedModel?: string;
  turns: Turn[];
  events: ThreadEvent[];
  images: (ImageEvent & { timestamp: string; timestampMs: number })[];
}

export interface Session {
  id: string;
  project: string;
  branch?: string;
  firstTimestampMs: number;
  lastTimestampMs: number;
  spanHours: number;
  daysTouched: number;
  turns: number;
  peakContext: number;
  compactions: number;
  mainThreadId: string;
  subagentThreadIds: string[];
  resumeCommand: string;
  /** filled in once pricing has run */
  mainDollars?: MicroDollars;
  subagentDollars?: MicroDollars;
}

export interface DataQuality {
  filesRead: number;
  filesFailed: string[];
  duplicateLinesDropped: number;
  unknownRecordTypes: Record<string, number>;
  claudeCodeVersions: string[];
  unknownModels: Record<string, number>;
  unpricedTokens: number;
  pricingStale: boolean;
  pricingAsOf: string;
  pricingAgeDays: number;
  inferenceGeoValues: Record<string, number>;
  reconciliation: "pass" | "fail" | "not_run";
}

export interface ByKindTotals {
  dollars: MicroDollars;
  share: number;
}

export interface ByModelTotals {
  model: string;
  dollars: MicroDollars;
  tokens: TokenCounts;
  dollarsPerMillionTokens: number;
  share: number;
  fastShare: number;
}

export interface ByThreadTotals {
  mainDollars: MicroDollars;
  subagentDollars: MicroDollars;
  subagentsByType: Record<string, MicroDollars>;
}

export interface ContextBin {
  label: "under_50k" | "50k_to_150k" | "150k_to_300k" | "over_300k";
  turns: number;
  dollars: MicroDollars;
}

export interface ContextMetrics {
  bins: ContextBin[];
  median: number;
  p90: number;
  max: number;
  excessContextCost: MicroDollars;
}

export type CacheBreakCause =
  | "compaction"
  | "model_switch"
  | "idle_expiry"
  | "unknown";

export interface CacheBreak {
  threadId: string;
  timestamp: string;
  cause: CacheBreakCause;
  countedAsWaste: boolean;
  dollars: MicroDollars;
}

export type PayoffOutcome = "not_needed" | "saved" | "expired";

export interface PayoffSummary {
  notNeeded: number;
  saved: number;
  expired: number;
  /** Extra paid for writing 1h instead of 5m, on every 1h write. */
  premiumPaid: MicroDollars;
  /** On a 5 to 60 minute gap, the next turn's cache read would have been a 5m rewrite. */
  rewritesAvoided: MicroDollars;
  /** premiumPaid minus rewritesAvoided. Positive means 1h cost more than 5m would have. */
  netDollars: MicroDollars;
  /** netDollars attributed per thread, for R11's evidence sessions. */
  byThread: Record<string, MicroDollars>;
}

export interface CacheMetrics {
  hitRate: number;
  breaks: CacheBreak[];
  breaksByCause: Record<CacheBreakCause, number>;
  payoff: PayoffSummary;
}

export interface OverheadMetrics {
  firstTurnPromptSizeMedian: number;
  catalogSizeBytes: number;
  catalogSkillCount: number;
  catalogTokensEstimate: number;
  catalogCostEstimate: MicroDollars;
}

export interface Totals {
  dollars: MicroDollars;
  requests: number;
  turns: number;
  sessions: number;
  tokens: TokenCounts;
}

export type FindingConfidence = "measured" | "lower_bound" | "estimated";

export interface Finding {
  rule: string;
  title: string;
  dollars: MicroDollars;
  confidence: FindingConfidence;
  sessionIds: string[];
  action: string;
  resumeCommand: string;
}

export interface WhatifRow {
  model: string;
  totalDollars: MicroDollars;
  mainDollars: MicroDollars;
  subagentDollars: MicroDollars;
  deltaDollars: MicroDollars;
}

export type SinceLastWeekDirection = "up" | "down" | "same";

export interface SinceLastWeekRow {
  rule: string;
  title: string;
  metricThen: MicroDollars;
  metricNow: MicroDollars;
  direction: SinceLastWeekDirection;
}

export interface Report {
  schema_version: 1;
  window: {
    start: string;
    end: string;
    tz: string;
    isoWeek: string;
    activeDays: number;
    missingDays: number;
  };
  pricing: {
    file: string;
    as_of: string;
    ageDays: number;
    stale: boolean;
    unknownModels: string[];
    unpricedTokens: number;
  };
  totals: Totals;
  by_kind: Record<TokenKind, ByKindTotals>;
  by_model: ByModelTotals[];
  by_thread: ByThreadTotals;
  context: ContextMetrics;
  cache: CacheMetrics;
  overhead: OverheadMetrics;
  sessions: Session[];
  findings: Finding[];
  whatif: WhatifRow[];
  since_last_week: SinceLastWeekRow[];
  data_quality: DataQuality;
}
