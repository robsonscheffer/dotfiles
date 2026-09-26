// Renders the scanned tickets as a mate-doc markdown dashboard page: frontmatter, a `:::tiles`
// summary, one progress line and table per phase. `mate-doc build`/`mate-doc open` render it,
// same as any other doc. The old artifact-serving skill wrote a self-contained HTML file
// directly; this writes markdown instead and lets the shared renderer do that work.
import { dirname, relative, sep } from "node:path";
import { computeStats, groupByPhase, type PhaseGroup, type Ticket } from "./scan.ts";

export interface RenderBurndownInput {
  outPath: string; // where the markdown will be written; relative links are computed from here
  epicTitle: string;
  epicPath: string;
  generatedDate: string;
  tickets: Ticket[];
  phaseTitles: Record<number, string>;
}

function mdLink(fromDir: string, toAbsPath: string): string {
  const rel = relative(fromDir, toAbsPath).split(sep).join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function phaseTitle(group: PhaseGroup, phaseTitles: Record<number, string>): string {
  if (group.phase === "unphased") return "Unphased";
  const title = phaseTitles[group.phase] ?? "";
  return title ? `Phase ${group.phase} · ${title}` : `Phase ${group.phase}`;
}

function phaseSection(fromDir: string, group: PhaseGroup, phaseTitles: Record<number, string>): string {
  const done = group.tickets.filter((t) => t.status === "done").length;
  const total = group.tickets.length;
  const rows = group.tickets
    .map((t) => {
      const idCell = `[${escapeCell(t.id)}](${mdLink(fromDir, t.path)})`;
      const depends = t.depends.length > 0 ? t.depends.join(", ") : "—";
      return `| ${idCell} | ${escapeCell(t.title)} | ${escapeCell(t.status)} | ${escapeCell(t.needs || "—")} | ${escapeCell(depends)} |`;
    })
    .join("\n");

  return [
    `## ${phaseTitle(group, phaseTitles)} (${done}/${total})`,
    "",
    "| ID | Title | Status | Needs | Depends |",
    "| --- | --- | --- | --- | --- |",
    rows,
  ].join("\n");
}

export function renderBurndownMarkdown(input: RenderBurndownInput): string {
  const fromDir = dirname(input.outPath);
  const stats = computeStats(input.tickets);
  const groups = groupByPhase(input.tickets);
  const epicLink = mdLink(fromDir, input.epicPath);

  const frontmatter = [
    "---",
    `title: ${input.epicTitle}`,
    "type: dashboard",
    `summary: Burndown for ${input.epicTitle}.`,
    `created: ${input.generatedDate}`,
    `updated: ${input.generatedDate}`,
    "---",
  ].join("\n");

  const tiles = [
    ":::tiles",
    `Total: ${stats.total}`,
    `Done: ${stats.done}`,
    `Building: ${stats.building}`,
    `Open: ${stats.open + stats.ready}`,
    `Progress: ${stats.progressPct}%`,
    ":::",
  ].join("\n");

  const sections = groups.map((g) => phaseSection(fromDir, g, input.phaseTitles)).join("\n\n");

  return [
    frontmatter,
    "",
    `# ${input.epicTitle}`,
    "",
    `[epic](${epicLink}) · generated ${input.generatedDate}`,
    "",
    tiles,
    "",
    sections,
    "",
  ].join("\n");
}
