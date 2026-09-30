// End-to-end: the burndown-sync CLI scans real ticket folders on disk and writes a markdown
// dashboard file, same --repo/--prefix/--epic/--out contract as the old artifact-serving skill's
// burndown-sync (which wrote HTML). This one writes markdown for mate-doc to render.
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { main } from "../../src/burndown/cli.ts";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import { addFolder, loadFolders } from "../../src/serve/state.ts";
import { loadLedgerSync } from "../../src/serve/ledger-sync.ts";
import { serve } from "../../src/serve/server.ts";
import type { ServerHandle } from "../../src/types.ts";

const dirs: string[] = [];
async function tempDir(prefix: string): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

let prevStateDir: string | undefined;
beforeEach(async () => {
  prevStateDir = process.env.MATE_DOC_STATE_DIR;
  process.env.MATE_DOC_STATE_DIR = await tempDir("mate-doc-burndown-cli-state-");
});
afterEach(async () => {
  if (prevStateDir === undefined) delete process.env.MATE_DOC_STATE_DIR;
  else process.env.MATE_DOC_STATE_DIR = prevStateDir;
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("burndown-sync CLI", () => {
  test("writes a markdown dashboard from scanned tickets", async () => {
    const repo = await tempDir("mate-doc-burndown-cli-repo-");
    await mkdir(join(repo, "docs", "epics"), { recursive: true });
    await writeFile(join(repo, "docs", "epics", "canvas.md"), "# Epic: Canvas rebuild\n\n## Phase 0 · Groundwork\n");

    const ticketDir = join(repo, "docs", "plans", "active", "CANVAS-001-first");
    await mkdir(ticketDir, { recursive: true });
    await writeFile(
      join(ticketDir, "README.md"),
      '---\nid: CANVAS-001\nstatus: open\nneeds: spec\ntags: ["phase-0"]\n---\n## What\nFirst thing\n',
    );

    const outDir = await tempDir("mate-doc-burndown-cli-out-");
    const out = join(outDir, "canvas-epic.md");

    const code = await main([
      "--repo", repo,
      "--prefix", "CANVAS",
      "--epic", join(repo, "docs", "epics", "canvas.md"),
      "--out", out,
      "--date", "2026-09-25",
    ]);

    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const content = await readFile(out, "utf8");
    expect(content).toContain('title: "Canvas rebuild"');
    expect(content).toContain("## Phase 0 · Groundwork (0 of 1 done)");
    expect(content).toContain("First thing");
  });

  test("registers the tickets folder with the viewer state", async () => {
    const repo = await tempDir("mate-doc-burndown-cli-register-repo-");
    await mkdir(join(repo, "docs", "epics"), { recursive: true });
    await writeFile(join(repo, "docs", "epics", "canvas.md"), "# Epic: Canvas rebuild\n");

    const ticketDir = join(repo, "docs", "plans", "active", "CANVAS-001-first");
    await mkdir(ticketDir, { recursive: true });
    await writeFile(join(ticketDir, "README.md"), "---\nid: CANVAS-001\nstatus: open\n---\n## What\nFirst thing\n");

    const outDir = await tempDir("mate-doc-burndown-cli-register-out-");
    const out = join(outDir, "canvas-epic.md");

    await main([
      "--repo", repo,
      "--prefix", "CANVAS",
      "--epic", join(repo, "docs", "epics", "canvas.md"),
      "--out", out,
      "--date", "2026-09-25",
    ]);

    const state = await loadFolders(process.env.MATE_DOC_STATE_DIR!);
    const ticketsFolder = await realpath(join(repo, "docs", "plans"));
    expect(state.folders.some((f) => f.path === ticketsFolder)).toBe(true);
  });

  test("ticket links resolve through the viewer when tickets live in a different folder than the dashboard", async () => {
    const repo = await tempDir("mate-doc-burndown-cli-resolve-repo-");
    await mkdir(join(repo, "docs", "epics"), { recursive: true });
    await writeFile(join(repo, "docs", "epics", "canvas.md"), "# Epic: Canvas rebuild\n\n## Phase 0 · Groundwork\n");

    const ticketDir = join(repo, "docs", "plans", "active", "CANVAS-001-first");
    await mkdir(ticketDir, { recursive: true });
    await writeFile(
      join(ticketDir, "README.md"),
      '---\nid: CANVAS-001\nstatus: open\nneeds: spec\ntags: ["phase-0"]\n---\n## What\nFirst thing\n',
    );

    const outDir = await tempDir("mate-doc-burndown-cli-resolve-out-");
    const out = join(outDir, "canvas-epic.md");

    const code = await main([
      "--repo", repo,
      "--prefix", "CANVAS",
      "--epic", join(repo, "docs", "epics", "canvas.md"),
      "--out", out,
      "--date", "2026-09-25",
    ]);
    expect(code).toBe(0);

    const stateDir = process.env.MATE_DOC_STATE_DIR!;
    const dashboardEntry = await addFolder(stateDir, outDir);

    let handle: ServerHandle | undefined;
    try {
      handle = await serve({
        host: "127.0.0.1",
        port: 0,
        stateDir,
        parse,
        render,
        loadLedger: loadLedgerSync,
      });

      const dashboardRes = await fetch(`${handle.url}/${dashboardEntry.alias}/canvas-epic`);
      expect(dashboardRes.status).toBe(200);
      const html = await dashboardRes.text();

      const ticketHref = new URL(html.match(/href="([^"]*CANVAS-001-first[^"]*)"/)![1]!, handle.url).pathname;
      const ticketRes = await fetch(`${handle.url}${ticketHref}`);
      expect(ticketRes.status).toBe(200);
    } finally {
      await handle?.stop();
    }
  });

  test("usage error (missing required args) returns exit code 2", async () => {
    expect(await main(["--repo", "/tmp"])).toBe(2);
  });

  test("exit code 1 when the repo path doesn't exist", async () => {
    const code = await main([
      "--repo", "/does/not/exist",
      "--prefix", "CANVAS",
      "--epic", "/does/not/exist.md",
      "--out", "/tmp/out.md",
    ]);
    expect(code).toBe(1);
  });
});
