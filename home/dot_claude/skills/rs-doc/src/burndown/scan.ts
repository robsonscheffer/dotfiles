// Reads mate ticket folders and epic phase headings off disk. Ported from the old
// the old artifact-serving skill's lib/burndown.mjs, minus the gray-matter dependency (reuses mate-doc's
// own frontmatter extractor).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { extractFrontmatter } from "../parser/frontmatter.ts";

export interface Ticket {
  id: string;
  number: number;
  slug: string;
  bucket: "active" | "done";
  path: string; // absolute path to the ticket's README.md
  status: string;
  needs: string;
  tags: string[];
  phase: number | null;
  depends: string[];
  title: string;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function deriveTicketTitle(body: string, slug: string): string {
  const whatMatch = /##\s*What\s*\n+([^\n]+)/i.exec(body);
  if (whatMatch) {
    const firstLine = whatMatch[1]!.trim();
    if (firstLine.length > 0 && firstLine.length <= 90) return firstLine;
  }
  return slug.replace(/-/g, " ");
}

// Scans <repoRoot>/docs/plans/{active,done}/<PREFIX>-NNN(-slug)?/README.md.
export function scanTickets(repoRoot: string, prefix: string): Ticket[] {
  const tickets: Ticket[] = [];
  const idPattern = new RegExp(`^(${prefix}-\\d+)(?:-([a-z0-9-]+))?$`);

  for (const bucket of ["active", "done"] as const) {
    const dir = join(repoRoot, "docs", "plans", bucket);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const m = idPattern.exec(name);
      if (!m) continue;
      const readme = join(dir, name, "README.md");
      if (!existsSync(readme)) continue;

      const id = m[1]!;
      const slug = m[2] ?? "";
      const number = Number(id.split("-")[1]);
      const raw = readFileSync(readme, "utf8");
      const { frontmatter, body } = extractFrontmatter(raw);
      const extra = frontmatter.extra;

      const tags = asStringArray(frontmatter.tags);
      const phaseTag = tags.find((t) => /^phase-\d+$/.test(t));
      const phase = phaseTag ? Number(phaseTag.replace("phase-", "")) : null;

      tickets.push({
        id,
        number,
        slug,
        bucket,
        path: readme,
        status: String(frontmatter.status ?? "open"),
        needs: String(extra.needs ?? ""),
        tags,
        phase,
        depends: asStringArray(extra.depends),
        title: deriveTicketTitle(body, slug),
      });
    }
  }

  tickets.sort((a, b) => a.number - b.number);
  return tickets;
}

// Reads "## Phase N · <title>" (or "- "/"." as the separator) headings from an epic doc.
export function parseEpicPhases(epicPath: string): Record<number, string> {
  if (!existsSync(epicPath)) return {};
  const raw = readFileSync(epicPath, "utf8");
  const phases: Record<number, string> = {};
  const re = /^##\s+Phase\s+(\d+)\s*[·.\-]\s*(.+?)\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    phases[Number(m[1])] = m[2]!.trim();
  }
  return phases;
}

export interface Stats {
  total: number;
  open: number;
  ready: number;
  building: number;
  done: number;
  dropped: number;
  progressPct: number;
}

export function computeStats(tickets: Ticket[]): Stats {
  const stats: Stats = {
    total: tickets.length,
    open: 0,
    ready: 0,
    building: 0,
    done: 0,
    dropped: 0,
    progressPct: 0,
  };
  for (const t of tickets) {
    if (t.status in stats) {
      const bag = stats as unknown as Record<string, number>;
      bag[t.status] = (bag[t.status] ?? 0) + 1;
    }
  }
  const live = stats.total - stats.dropped;
  stats.progressPct = live > 0 ? Math.round((stats.done / live) * 100) : 0;
  return stats;
}

export interface PhaseGroup {
  phase: number | "unphased";
  tickets: Ticket[];
}

export function groupByPhase(tickets: Ticket[]): PhaseGroup[] {
  const byPhase = new Map<number | "unphased", Ticket[]>();
  for (const t of tickets) {
    const key = t.phase === null ? "unphased" : t.phase;
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key)!.push(t);
  }
  const sortedKeys = [...byPhase.keys()].sort((a, b) => {
    if (a === "unphased") return 1;
    if (b === "unphased") return -1;
    return a - b;
  });
  return sortedKeys.map((phase) => ({ phase, tickets: byPhase.get(phase) ?? [] }));
}
