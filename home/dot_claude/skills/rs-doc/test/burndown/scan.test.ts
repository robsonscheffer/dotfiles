import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { computeStats, groupByPhase, parseEpicPhases, scanTickets } from "../../src/burndown/scan.ts";

const dirs: string[] = [];
async function tempDir(prefix: string): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function ticketFolder(repo: string, bucket: "active" | "done", name: string, frontmatter: string, body = ""): Promise<void> {
  const dir = join(repo, "docs", "plans", bucket, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "README.md"), `---\n${frontmatter}\n---\n${body}`);
}

describe("burndown: scanTickets", () => {
  test("scans active and done tickets for a prefix, sorted by number", async () => {
    const repo = await tempDir("mate-doc-burndown-repo-");
    await ticketFolder(
      repo,
      "active",
      "CANVAS-002-second",
      'id: CANVAS-002\nstatus: building\nneeds: verify\ntags: ["phase-1"]\ndepends: ["CANVAS-001"]',
      "## What\nBuild the second thing\n",
    );
    await ticketFolder(repo, "done", "CANVAS-001-first", "id: CANVAS-001\nstatus: done\nneeds: verify\ntags: [\"phase-1\"]", "## What\nBuild the first thing\n");
    // A folder for a different prefix is ignored.
    await ticketFolder(repo, "active", "OTHER-001-unrelated", "id: OTHER-001\nstatus: open\nneeds: spec");

    const tickets = scanTickets(repo, "CANVAS");

    expect(tickets.map((t) => t.id)).toEqual(["CANVAS-001", "CANVAS-002"]);
    expect(tickets[0]!.bucket).toBe("done");
    expect(tickets[0]!.status).toBe("done");
    expect(tickets[0]!.title).toBe("Build the first thing");
    expect(tickets[1]!.status).toBe("building");
    expect(tickets[1]!.depends).toEqual(["CANVAS-001"]);
    expect(tickets[1]!.phase).toBe(1);
  });

  test("falls back to a slugified title when there's no ## What line", async () => {
    const repo = await tempDir("mate-doc-burndown-repo-");
    await ticketFolder(repo, "active", "CANVAS-003-fix-the-thing", "id: CANVAS-003\nstatus: open\nneeds: spec");

    const [ticket] = scanTickets(repo, "CANVAS");
    expect(ticket!.title).toBe("fix the thing");
  });

  test("returns an empty list when the repo has no matching tickets", async () => {
    const repo = await tempDir("mate-doc-burndown-repo-");
    expect(scanTickets(repo, "CANVAS")).toEqual([]);
  });
});

describe("burndown: parseEpicPhases", () => {
  test("reads '## Phase N · Title' headings", async () => {
    const dir = await tempDir("mate-doc-burndown-epic-");
    const epicPath = join(dir, "epic.md");
    await writeFile(epicPath, "# Epic: Canvas rebuild\n\n## Phase 0 · Groundwork\n\ntext\n\n## Phase 1 · Structural\n");

    expect(parseEpicPhases(epicPath)).toEqual({ 0: "Groundwork", 1: "Structural" });
  });

  test("returns an empty object when the epic file doesn't exist", () => {
    expect(parseEpicPhases("/does/not/exist.md")).toEqual({});
  });
});

describe("burndown: computeStats and groupByPhase", () => {
  test("computes totals and progress percentage over live (non-dropped) tickets", () => {
    const tickets = [
      { status: "done" } as never,
      { status: "done" } as never,
      { status: "building" } as never,
      { status: "dropped" } as never,
    ];
    const stats = computeStats(tickets);
    expect(stats).toMatchObject({ total: 4, done: 2, building: 1, dropped: 1, progressPct: 67 });
  });

  test("groups tickets by phase, unphased last", () => {
    const tickets = [
      { phase: 1 } as never,
      { phase: null } as never,
      { phase: 0 } as never,
    ];
    const groups = groupByPhase(tickets);
    expect(groups.map((g) => g.phase)).toEqual([0, 1, "unphased"]);
  });
});
