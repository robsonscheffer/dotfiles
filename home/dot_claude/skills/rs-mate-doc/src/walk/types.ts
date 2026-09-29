// Types for the walk shape's own inputs and fetched PR data. src/types.ts is the contracts
// lane's file (never edited here) - anything walk-specific that needs a shared shape lives in
// this file instead, per the WK lane brief.

// ---------------------------------------------------------------------------------------------
// Fetched PR data (Fetch step)

export interface PrAuthor {
  login: string;
}

export interface PrMeta {
  number: number;
  title: string;
  author: PrAuthor;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  baseRefOid: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
}

export interface FetchedPr {
  repo: string;
  meta: PrMeta;
  body: string;
  diff: string;
  files: string[];
}

export interface RawComments {
  comments: unknown[];
  reviews: unknown[];
}

// ---------------------------------------------------------------------------------------------
// Agent outputs (AGENT-PROMPTS.md schemas) - these stay agent work; this is just the shape.

export interface StoryGroup {
  title: string;
  lead?: string;
  framing: string;
  files: string[];
  note?: string;
}

export interface StoryData {
  lead?: string;
  story: string[];
  groups: StoryGroup[];
}

export interface QuestionItem {
  title: string;
  question: string;
  pointer: string;
}

export interface RiskItem {
  title: string;
  description: string;
  blast_radius: string;
  file: string;
}

export type JudgmentOverall = "strong" | "solid" | "cautious" | "concern";

export interface JudgmentData {
  fit: string;
  risks_summary: string[];
  gaps: string[];
  overall: JudgmentOverall;
}

export type TicketQualityScore = "good" | "adequate" | "thin" | "missing";
export type AcStatus = "Met" | "Partially Met" | "Not Met" | "Unplanned Deviation";

export interface TicketQuality {
  score: TicketQualityScore;
  notes: string;
}

export interface AcceptanceCriterion {
  criterion: string;
  status: AcStatus;
  evidence: string;
}

export interface TicketFit {
  ticket_key: string;
  ticket_quality: TicketQuality;
  acceptance_criteria: AcceptanceCriterion[];
  scope_delta: string;
}

export type AuthorKind = "bot" | "human";
export type HumanAuthenticity = "genuine" | "bot-posing-as-human" | "uncertain";

export interface CommentTriageEntry {
  author: string;
  author_kind: AuthorKind;
  human_authenticity?: HumanAuthenticity;
  summary: string;
  resolved?: boolean;
}

export interface ContextQmdItem {
  path: string;
  score: number;
  snippet: string;
}

export interface ContextData {
  mode: "qmd" | "grep";
  items: (ContextQmdItem | string)[];
}

export interface WalkInputs {
  story: StoryData;
  questions: QuestionItem[];
  risks: RiskItem[];
  judgment: JudgmentData;
  context?: ContextData;
  ticketFit?: TicketFit;
  commentTriage?: CommentTriageEntry[];
}

// ---------------------------------------------------------------------------------------------
// Compose output

export interface ComposedWalk {
  files: Record<string, string>; // "index.md" and "claims.yaml"
}
