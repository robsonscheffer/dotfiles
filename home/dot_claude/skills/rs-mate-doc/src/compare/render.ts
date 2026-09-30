// Builds the compare index.md: the prompt, the two system files with hashes, one score table
// (rows = checks then metrics, columns A | A-base | B | verdict), a blank "Your verdict:" line,
// and per run a :::tabs block with the three answers. A cell is `median [min..max]`, or the bare
// value for a single run. The verdict column only fires for checks, when the A-base and B
// ranges do not overlap. Every piece of agent-controlled text (prompt, run output) is fenced as
// code so nothing in it can be read as a directive or heading by the mate-doc parser - agent
// output is not trusted markdown.
import { summarize, verdict } from "./verdict.ts";
import { PANES, lowerIsBetter, type CheckSpec, type CheckValue, type CheckVerdict, type PaneName } from "./types.ts";

export interface PaneRun {
  text: string;
  checks: CheckValue[];
  seconds: number;
  context: number | null; // null when no transcript was found
  output: number | null;
  cost: number | null;
}

export type CompareRun = Record<PaneName, PaneRun>;

export interface ComposeInput {
  promptFile: string;
  prompt: string;
  basePath: string;
  baseHash: string;
  bPath: string;
  bHash: string;
  checks: CheckSpec[];
  runs: CompareRun[];
}

export interface VerdictRow {
  check: string;
  verdict: CheckVerdict;
}

export interface ComposeResult {
  files: Record<string, string>; // filename -> content, just index.md
  verdicts: VerdictRow[];
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

// A fence long enough that no run of the same character inside `content` can close it early.
function fenceFor(content: string): string {
  let longest = 0;
  for (const run of content.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return "`".repeat(Math.max(3, longest + 1));
}

function fenced(content: string): string {
  const fence = fenceFor(content);
  return `${fence}\n${content}\n${fence}`;
}

function num(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function usd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function cell(values: number[], format: (n: number) => string): string {
  if (values.length === 0) return "n/a";
  const s = summarize(values);
  if (values.length === 1) return format(s.median);
  return `${format(s.median)} [${format(s.min)}..${format(s.max)}]`;
}

function present(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null);
}

function paneValues(runs: CompareRun[], pane: PaneName, name: string): number[] {
  return runs.map((run) => run[pane].checks.find((c) => c.name === name)?.value ?? 0);
}

function row(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

export function composeCompare(input: ComposeInput): ComposeResult {
  const total = input.runs.length;
  const verdicts: VerdictRow[] = [];
  const lines: string[] = [row(["", "A", "A-base", "B", "verdict"]), row(["---", "---", "---", "---", "---"])];

  for (const spec of input.checks) {
    const [a, base, b] = PANES.map((pane) => paneValues(input.runs, pane, spec.name));
    const v = verdict(base!, b!, lowerIsBetter(spec));
    verdicts.push({ check: spec.name, verdict: v });
    lines.push(row([spec.name, cell(a!, num), cell(base!, num), cell(b!, num), v]));
  }

  const metrics: { label: string; pick: (r: PaneRun) => number | null; format: (n: number) => string }[] = [
    { label: "seconds", pick: (r) => r.seconds, format: num },
    { label: "context", pick: (r) => r.context, format: num },
    { label: "output", pick: (r) => r.output, format: num },
    { label: "cost", pick: (r) => r.cost, format: usd },
  ];
  for (const m of metrics) {
    const cells = PANES.map((pane) => cell(present(input.runs.map((run) => m.pick(run[pane]))), m.format));
    lines.push(row([m.label, ...cells, "-"]));
  }

  const runSections: string[] = [];
  for (let i = 0; i < total; i++) {
    const run = input.runs[i]!;
    const heading = total > 1 ? `## Run ${i + 1}\n\n` : "";
    const tabs = PANES.map((pane) => `## ${pane}\n\n${fenced(run[pane].text)}\n`).join("\n");
    runSections.push(`${heading}:::tabs\n${tabs}:::\n`);
  }

  const index =
    `---\n` +
    `title: "Compare: ${input.promptFile}"\n` +
    `summary: Same prompt in three panes, ${total} run${total === 1 ? "" : "s"} each, scored with the same checks.\n` +
    `---\n\n` +
    `# Compare: ${input.promptFile}\n\n` +
    `## Prompt\n\n` +
    `${fenced(input.prompt)}\n\n` +
    `## System files\n\n` +
    `- A-base: \`${input.basePath}\` (sha256 \`${input.baseHash}\`)\n` +
    `- B: \`${input.bPath}\` (sha256 \`${input.bHash}\`)\n\n` +
    `## Scores\n\n` +
    `${lines.join("\n")}\n\n` +
    `Your verdict:\n\n` +
    `## Output\n\n` +
    runSections.join("\n");

  return { files: { "index.md": index }, verdicts };
}

export interface SetEntry {
  name: string; // folder name, one per prompt
  verdicts: VerdictRow[];
}

export function composeSetIndex(entries: SetEntry[]): string {
  const lines = [row(["prompt", "verdicts"]), row(["---", "---"])];
  for (const entry of entries) {
    const text = entry.verdicts.map((v) => `${v.check}: ${v.verdict}`).join("; ");
    lines.push(row([`[${entry.name}](${entry.name}/index.md)`, text]));
  }
  return (
    `---\n` +
    `title: "Compare set"\n` +
    `summary: One verdict row per prompt.\n` +
    `---\n\n` +
    `# Compare set\n\n` +
    `${lines.join("\n")}\n`
  );
}

export interface TurnCell {
  text: string;
  checks: CheckValue[];
  seconds: number;
  context: number;
  output: number;
}

export interface ReportTurn {
  prompt: string;
  panes: Record<PaneName, TurnCell | null>; // null when that pane has no such turn or no transcript
}

// The interactive report: per turn a table of check values and metrics, no verdict column, then
// a blank "Your verdict:" line and the three answers in tabs. Numbers only; the reader decides.
export function composeInteractiveReport(input: { name: string; checks: CheckSpec[]; turns: ReportTurn[] }): string {
  const sections = input.turns.map((turn, i) => {
    const lines = [row(["", ...PANES]), row(["---", "---", "---", "---"])];
    const cells = (pick: (c: TurnCell) => string) => PANES.map((pane) => (turn.panes[pane] ? pick(turn.panes[pane]!) : "n/a"));
    for (const spec of input.checks) {
      lines.push(row([spec.name, ...cells((c) => num(c.checks.find((v) => v.name === spec.name)?.value ?? 0))]));
    }
    lines.push(row(["seconds", ...cells((c) => num(c.seconds))]));
    lines.push(row(["context", ...cells((c) => num(c.context))]));
    lines.push(row(["output", ...cells((c) => num(c.output))]));
    lines.push(row(["cost", "n/a", "n/a", "n/a"]));
    const tabs = PANES.map((pane) => `## ${pane}\n\n${fenced(turn.panes[pane]?.text ?? "(no answer)")}\n`).join("\n");
    return (
      `## Turn ${i + 1}\n\n${fenced(turn.prompt)}\n\n${lines.join("\n")}\n\n` +
      `Your verdict:\n\n:::tabs\n${tabs}:::\n`
    );
  });
  return (
    `---\n` +
    `title: "Compare (interactive): ${input.name}"\n` +
    `summary: One prompt in three panes, numbers per turn.\n` +
    `---\n\n` +
    `# Compare (interactive): ${input.name}\n\n` +
    (sections.length > 0 ? sections.join("\n") : "No turns found in the transcripts yet.\n")
  );
}
