// mate-doc contract. Every lane codes against this file. Change it only in the contracts lane.

// ---------------------------------------------------------------------------------------------
// Source positions

export interface Pos {
  line: number; // 1-based
  column: number; // 1-based
}

export interface Span {
  start: Pos;
  end: Pos;
}

// ---------------------------------------------------------------------------------------------
// Frontmatter: the vault schema, extended

export type Level = "draft" | "audited" | "official";
export type Shape = "plain" | "guide" | "brief" | "walk";

export interface Frontmatter {
  // vault fields
  title?: string;
  type?: string;
  summary?: string;
  tags?: string[];
  sources?: string[];
  created?: string;
  updated?: string;
  // mate-doc extension
  status?: Level;
  shape?: Shape;
  tour?: string[];
  approved_by?: string;
  approved_at?: string;
  ledger_hash?: string;
  // everything else, kept verbatim
  extra: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// AST: ours, independent of the CommonMark library underneath

export const DIRECTIVES = [
  "means",
  "collide",
  "warn",
  "note",
  "tiles",
  "flow",
  "steps",
  "tabs",
  "cards",
  "decide",
  "risks",
  "notverified",
  "rail",
  "reveal",
  "checks",
  "timeline",
  "progress",
] as const;
export type DirectiveName = (typeof DIRECTIVES)[number];

// Directives whose body is kept as raw lines instead of parsed markdown.
export const RAW_DIRECTIVES: readonly DirectiveName[] = ["flow", "tiles", "rail", "checks", "timeline"];

export type ClaimId = `C${number}`;

interface Base {
  pos: Span;
}

export type Node = Block | Inline;

export type Block =
  | HeadingNode
  | ParagraphNode
  | ListNode
  | ListItemNode
  | BlockquoteNode
  | CodeBlockNode
  | TableNode
  | ThematicBreakNode
  | HtmlBlockNode
  | DirectiveNode
  | ErrorNode;

export type Inline =
  | TextNode
  | InlineCodeNode
  | EmphasisNode
  | StrongNode
  | LinkNode
  | ImageNode
  | ClaimRefNode
  | HtmlInlineNode
  | BreakNode;

export interface HeadingNode extends Base {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  id: string; // slug, unique within the doc
  children: Inline[];
}
export interface ParagraphNode extends Base {
  type: "paragraph";
  children: Inline[];
}
export interface ListNode extends Base {
  type: "list";
  ordered: boolean;
  start?: number;
  children: ListItemNode[];
}
export interface ListItemNode extends Base {
  type: "listItem";
  checked?: boolean;
  children: Block[];
}
export interface BlockquoteNode extends Base {
  type: "blockquote";
  callout?: string; // Obsidian-style "> [!warning]"
  children: Block[];
}
export interface CodeBlockNode extends Base {
  type: "code";
  lang?: string; // info string first word, e.g. "ts", "diff"
  meta: Record<string, string>; // e.g. { title: "x.ts" }
  value: string;
}
export interface TableNode extends Base {
  type: "table";
  align: ("left" | "center" | "right" | null)[];
  head: Inline[][];
  rows: Inline[][][];
}
export interface ThematicBreakNode extends Base {
  type: "thematicBreak";
}
export interface HtmlBlockNode extends Base {
  type: "html";
  value: string;
}
export interface DirectiveNode extends Base {
  type: "directive";
  name: string; // a DirectiveName when known
  known: boolean;
  args: string[]; // words after the name on the opening line
  children: Block[]; // empty for RAW_DIRECTIVES
  raw?: string[]; // body lines for RAW_DIRECTIVES
}
export interface ErrorNode extends Base {
  type: "error";
  message: string; // e.g. "directive :::means is never closed"
  children: Block[];
}

export interface TextNode extends Base {
  type: "text";
  value: string;
}
export interface InlineCodeNode extends Base {
  type: "inlineCode";
  value: string;
}
export interface EmphasisNode extends Base {
  type: "emphasis";
  children: Inline[];
}
export interface StrongNode extends Base {
  type: "strong";
  children: Inline[];
}
export type LinkKind = "url" | "md" | "wiki" | "anchor";
export interface LinkNode extends Base {
  type: "link";
  kind: LinkKind;
  target: string; // url, relative .md path, wikilink name, or #anchor
  children: Inline[]; // label
}
export interface ImageNode extends Base {
  type: "image";
  src: string;
  alt: string;
}
export interface ClaimRefNode extends Base {
  type: "claimRef";
  id: ClaimId;
}
export interface HtmlInlineNode extends Base {
  type: "htmlInline";
  value: string;
}
export interface BreakNode extends Base {
  type: "break";
}

export interface HeadingRef {
  level: number;
  id: string;
  text: string;
  pos: Span;
}

export interface Doc {
  path: string;
  frontmatter: Frontmatter;
  body: Block[];
  headings: HeadingRef[];
  claimRefs: ClaimRefNode[];
  errors: ErrorNode[];
}

// ---------------------------------------------------------------------------------------------
// Ledger: claims.yaml

// "proposed": the author has evidence and wants a verdict from a verifier or a person.
export type ClaimStatus = "verified" | "inferred" | "proposed" | "not_verified";
export type Verdict = "supports" | "overstates" | "contradicts" | "unrelated" | "uncheckable"; // uncheckable: not a statement evidence can settle
export type Capability = "git" | "gh" | "snow" | "http" | `mcp:${string}`;

export interface CodeEvidence {
  kind: "code";
  ref: string; // "<repo>@<rev>:<path>:<line>"
  excerpt: string;
  needs: "git" | "gh";
}
export interface QueryEvidence {
  kind: "query";
  sql: string; // path relative to the doc folder
  expect: { rows?: number; value?: number | string; tolerance?: number };
  needs: Capability;
}
export interface LinkEvidence {
  kind: "link";
  url: string;
  excerpt?: string;
  needs: "http" | "gh";
}
export interface RecordEvidence {
  kind: "record";
  ref: string; // an API path or query that returns one record
  field: string; // dotted path into the record
  expect: string | number | boolean;
  needs: Capability;
}
export interface McpEvidence {
  kind: "mcp";
  source: string; // permalink or URL
  excerpt: string;
  needs: `mcp:${string}`;
}
export type Evidence = CodeEvidence | QueryEvidence | LinkEvidence | RecordEvidence | McpEvidence;

export interface Claim {
  id: ClaimId;
  claim: string;
  status: ClaimStatus;
  evidence?: Evidence; // required unless not_verified
  verdict?: Verdict; // LLM judgment, recorded with `mate-doc verdict`
  checked_by?: string; // "agent:<name>" or a person
  checked_at?: string; // ISO date
  verdict_reason?: string;
  verdict_hash?: string; // claimHash of the claim and evidence the verdict judged
  ttl_days?: number;
  owner?: string; // required when not_verified: who to ask
}

export interface Ledger {
  path: string;
  author?: string; // who wrote the doc, e.g. "agent:claude" or "human:Alex"
  claims: Claim[];
}

// ---------------------------------------------------------------------------------------------
// Environment: injected so every check is testable without real git, network, or warehouse

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Env {
  has(cap: Capability): boolean;
  run(cmd: string[], opts?: { cwd?: string; timeoutMs?: number; input?: string }): Promise<RunResult>;
  fetch(url: string): Promise<{ status: number; body: string }>;
  now(): Date;
}

// ---------------------------------------------------------------------------------------------
// Audit, freshness, lint, gate

export type StaleReason = "ttl" | "drift" | "check-failed" | "capability-missing";

export interface CheckResult {
  claim: ClaimId;
  capability: Capability;
  ran: boolean; // false when the capability is missing or the kind is mcp
  ok: boolean | null; // null when not run
  detail: string;
}

export interface Freshness {
  fresh: boolean;
  stale: { claim: ClaimId; reason: StaleReason; detail: string }[];
}

export type WorkReason = "new" | "changed" | "expired" | "drift" | "mcp" | "capability-missing";

export interface AuditWorkItem {
  claim: ClaimId;
  reason: WorkReason;
  needs: Capability;
  source: string; // ref, url, or sql path, whatever the agent must open
  sentence: string; // the page sentence the claim supports, for the verdict
}

export interface AuditResult {
  docDir: string;
  checks: CheckResult[];
  freshness: Freshness;
  worklist: AuditWorkItem[];
}

export type LintRule =
  | "claim-unresolved"
  | "claim-incomplete"
  | "not-verified-without-owner"
  | "em-dash"
  | "private-path"
  | "localhost-url"
  | "secret-in-excerpt"
  | "pii-in-excerpt"
  | "unknown-directive"
  | "parse-error"
  | "unclaimed-fact" // warn only, see Q-e
  | "badge-tone" // warn only, unknown badge tone falls back to neutral at render time
  | "verified-without-verdict"
  | "claim-is-instruction"
  | "weak-excerpt"
  | "excerpt-local-ref";

export interface LintIssue {
  rule: LintRule;
  severity: "error" | "warn";
  message: string;
  path: string;
  pos?: Span;
  claim?: ClaimId;
}

export type GateReason =
  | "lint"
  | "no-verdict"
  | "verdict-not-supports"
  | "stale"
  | "capability-missing"
  | "check-failed"
  | "no-owner"
  | "no-author"
  | "verdict-not-independent"
  | "verdict-stale"
  | "mcp-needs-human";

export interface GateReasonItem {
  kind: GateReason;
  message: string;
  path: string;
  pos: Span;
  claim?: ClaimId;
  rule?: LintRule; // present when kind is "lint"
}

export interface GateResult {
  pass: boolean;
  levelBefore: Level;
  levelAfter: Level;
  reasons: GateReasonItem[];
  summary: { claims: number; verified: number; open: number; stale: number };
}

// ---------------------------------------------------------------------------------------------
// Render

export interface Banner {
  level: Level;
  approvedAt?: string;
  claims: number;
  open: number;
  fresh: boolean;
}

export interface NavPage {
  title: string;
  href: string;
  current: boolean;
}

export interface NavInfo {
  breadcrumbs: { title: string; href: string }[];
  pages: NavPage[];
  prev?: NavPage;
  next?: NavPage;
}

export interface RenderOptions {
  banner?: Banner; // omitted for plain docs
  nav?: NavInfo; // present in folder mode
  theme: "auto" | "light" | "dark";
  liveReload?: string; // SSE endpoint, injected by the viewer only
  resolveLink?: (node: LinkNode) => string | null; // null means unresolved
}

// ---------------------------------------------------------------------------------------------
// Serve

export interface ServeOptions {
  host: "127.0.0.1";
  port: number;
  stateDir: string;
  parse: Parse;
  render: Render;
  loadLedger: (docDir: string) => Ledger | null;
}

export interface ServerHandle {
  url: string;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// The functions each lane implements

export type Parse = (src: string, path: string) => Doc; // L1
export type Render = (doc: Doc, ledger: Ledger | null, opts: RenderOptions) => string; // L2
export type Lint = (docs: Doc[], ledger: Ledger | null) => LintIssue[]; // L3
export type Audit = (docDir: string, env: Env) => Promise<AuditResult>; // L3
export type Gate = (docDir: string, env: Env) => Promise<GateResult>; // L3
export type LedgerHash = (docs: Doc[], ledger: Ledger | null, docDir: string) => string; // L3
export type Serve = (opts: ServeOptions) => Promise<ServerHandle>; // L5

// ---------------------------------------------------------------------------------------------
// CLI

export const COMMANDS = [
  "setup",
  "new",
  "open",
  "build",
  "lint",
  "audit",
  "verdict",
  "gate",
  "approve",
  "publish",
  "status",
  "forget",
  "walk",
  "compare",
] as const;
export type Command = (typeof COMMANDS)[number];

// 0 ok, 1 a check failed (lint, gate), 2 usage or not built yet, 3 environment (bun, config)
export const EXIT = { ok: 0, failed: 1, usage: 2, env: 3 } as const;
