// End-to-end: the burndown-sync CLI scans real ticket folders on disk and writes a markdown
// dashboard file, same --repo/--prefix/--epic/--out contract as the old artifact-serving skill's
// burndown-sync (which wrote HTML). This one writes markdown for mate-doc to render.
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { main } from "../../src/burndown/cli.ts";

const dirs: string[] = [];
async function tempDir(prefix: string): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
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

    const code = main([
      "--repo", repo,
      "--prefix", "CANVAS",
      "--epic", join(repo, "docs", "epics", "canvas.md"),
      "--out", out,
      "--date", "2026-09-25",
    ]);

    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const content = await readFile(out, "utf8");
    expect(content).toContain("title: Canvas rebuild");
    expect(content).toContain("## Phase 0 · Groundwork (0/1)");
    expect(content).toContain("First thing");
  });

  test("usage error (missing required args) returns exit code 2", () => {
    expect(main(["--repo", "/tmp"])).toBe(2);
  });

  test("exit code 1 when the repo path doesn't exist", () => {
    const code = main([
      "--repo", "/does/not/exist",
      "--prefix", "CANVAS",
      "--epic", "/does/not/exist.md",
      "--out", "/tmp/out.md",
    ]);
    expect(code).toBe(1);
  });
});
