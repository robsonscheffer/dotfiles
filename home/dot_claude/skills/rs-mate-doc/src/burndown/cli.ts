#!/usr/bin/env bun
// burndown-sync CLI: scans mate tickets under a repo and (re)writes a markdown burndown
// dashboard. `mate-doc build`/`mate-doc open` render the result; this script only writes
// the markdown, mirroring the old artifact-serving skill's burndown-sync (same --repo/--prefix/
// --epic/--out inputs and outputs), minus the HTML templating step it used to own.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { computeStats, parseEpicPhases, scanTickets } from "./scan.ts";
import { renderBurndownMarkdown } from "./render.ts";
import { addFolder, defaultStateDir } from "../serve/state.ts";

function arg(argv: string[], name: string, fallback: string | null = null): string | null {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
}

function expand(p: string | null): string | null {
  if (!p) return p;
  if (p === "~") return process.env.HOME ?? p;
  if (p.startsWith("~/")) return `${process.env.HOME ?? ""}${p.slice(1)}`;
  return p;
}

function usage(): void {
  process.stderr.write(`Usage:
  burndown-sync --repo <repo-root> --prefix <PREFIX> --epic <epic.md> --out <dashboard.md>

Required:
  --repo     path to repo containing docs/plans/{active,done}/
  --prefix   ticket prefix (e.g. CANVAS)
  --epic     path to docs/epics/<slug>.md
  --out      output dashboard markdown path

Optional:
  --title    epic title (default: read from first heading in epic md)
  --date     generation date YYYY-MM-DD (default: today)
`);
}

export async function main(argv: string[]): Promise<number> {
  const repo = expand(arg(argv, "repo"));
  const prefix = arg(argv, "prefix");
  const epic = expand(arg(argv, "epic"));
  const out = expand(arg(argv, "out"));
  const explicitTitle = arg(argv, "title");
  const explicitDate = arg(argv, "date");

  if (!repo || !prefix || !epic || !out) {
    usage();
    return 2;
  }
  if (!existsSync(repo)) {
    process.stderr.write(`error: repo not found: ${repo}\n`);
    return 1;
  }
  if (!existsSync(epic)) {
    process.stderr.write(`error: epic md not found: ${epic}\n`);
    return 1;
  }

  const tickets = scanTickets(repo, prefix);
  if (tickets.length === 0) {
    process.stderr.write(`warning: no tickets found for prefix ${prefix} under ${repo}/docs/plans/\n`);
  }
  const phaseTitles = parseEpicPhases(epic);

  let epicTitle = explicitTitle;
  if (!epicTitle) {
    const h1 = /^#\s+(.+?)\s*$/m.exec(readFileSync(epic, "utf8"));
    epicTitle = h1 ? h1[1]!.replace(/^Epic:\s*/i, "").trim() : basename(epic, ".md");
  }

  const generatedDate = explicitDate ?? new Date().toISOString().slice(0, 10);

  const markdown = renderBurndownMarkdown({
    outPath: out,
    epicTitle,
    epicPath: epic,
    generatedDate,
    tickets,
    phaseTitles,
  });

  writeFileSync(out, markdown);

  // The dashboard's ticket links only resolve through the viewer if the tickets folder
  // is remembered too, same as the dashboard's own folder.
  await addFolder(defaultStateDir(), join(repo, "docs", "plans"));

  process.stdout.write(`wrote ${out}\n`);
  process.stdout.write(`  tickets: ${tickets.length}\n`);
  const stats = computeStats(tickets);
  for (const [status, count] of Object.entries({
    open: stats.open,
    ready: stats.ready,
    building: stats.building,
    done: stats.done,
    dropped: stats.dropped,
  })) {
    if (count > 0) process.stdout.write(`  ${status}: ${count}\n`);
  }

  return 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
