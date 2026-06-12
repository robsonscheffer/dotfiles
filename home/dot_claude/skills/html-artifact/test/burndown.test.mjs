#!/usr/bin/env node
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { strict as assert } from "assert";
import {
  scanTickets,
  parseEpicPhases,
  computeStats,
  groupByPhase,
  renderBurndown,
} from "../lib/burndown.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = resolve(SKILL_DIR, "dist/templates/burndown.html");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function setupRepo(rows) {
  const repo = mkdtempSync(join(tmpdir(), "burndown-"));
  for (const row of rows) {
    const bucket =
      row.status === "done" || row.status === "dropped" ? "done" : "active";
    const dir = join(repo, "docs", "plans", bucket, `${row.id}-${row.slug}`);
    mkdirSync(dir, { recursive: true });
    const tags = JSON.stringify(row.tags || ["test", `phase-${row.phase}`]);
    writeFileSync(
      join(dir, "README.md"),
      `---
id: ${row.id}
status: ${row.status}
needs: ${row.needs || "spec"}
created: 2026-06-12
updated: 2026-06-12
tags: ${tags}
${row.depends ? `depends: ${JSON.stringify(row.depends)}\n` : ""}---

## What

${row.title || "stub"}

## Why

stub
`,
    );
  }
  mkdirSync(join(repo, "docs", "epics"), { recursive: true });
  writeFileSync(
    join(repo, "docs", "epics", "demo.md"),
    `# Epic: demo

## What
stub

## Phase 0 · groundwork
table

## Phase 1 · ports
table
`,
  );
  return repo;
}

test("scanTickets picks up active and done buckets", () => {
  const repo = setupRepo([
    { id: "DEMO-001", slug: "first", status: "done", phase: 0 },
    { id: "DEMO-002", slug: "second", status: "open", phase: 0 },
    { id: "DEMO-003", slug: "third", status: "building", phase: 1 },
  ]);
  const t = scanTickets(repo, "DEMO");
  assert.equal(t.length, 3);
  assert.equal(t[0].id, "DEMO-001");
  assert.equal(t[0].bucket, "done");
  assert.equal(t[1].bucket, "active");
  rmSync(repo, { recursive: true, force: true });
});

test("scanTickets sorts numerically not lexicographically", () => {
  const repo = setupRepo([
    { id: "DEMO-001", slug: "a", status: "open", phase: 0 },
    { id: "DEMO-010", slug: "b", status: "open", phase: 0 },
    { id: "DEMO-002", slug: "c", status: "open", phase: 0 },
  ]);
  const t = scanTickets(repo, "DEMO");
  assert.deepEqual(
    t.map((x) => x.id),
    ["DEMO-001", "DEMO-002", "DEMO-010"],
  );
  rmSync(repo, { recursive: true, force: true });
});

test("scanTickets extracts phase tag", () => {
  const repo = setupRepo([
    { id: "DEMO-001", slug: "x", status: "open", phase: 2 },
  ]);
  const t = scanTickets(repo, "DEMO");
  assert.equal(t[0].phase, 2);
  rmSync(repo, { recursive: true, force: true });
});

test("scanTickets handles untagged phase as null", () => {
  const repo = setupRepo([
    { id: "DEMO-001", slug: "x", status: "open", phase: 0, tags: ["test"] },
  ]);
  const t = scanTickets(repo, "DEMO");
  assert.equal(t[0].phase, null);
  rmSync(repo, { recursive: true, force: true });
});

test("computeStats handles all-open", () => {
  const s = computeStats([
    { status: "open" },
    { status: "open" },
    { status: "open" },
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.done, 0);
  assert.equal(s.progressPct, 0);
});

test("computeStats handles mixed states", () => {
  const s = computeStats([
    { status: "done" },
    { status: "done" },
    { status: "building" },
    { status: "open" },
  ]);
  assert.equal(s.done, 2);
  assert.equal(s.building, 1);
  assert.equal(s.open, 1);
  assert.equal(s.progressPct, 50);
});

test("computeStats excludes dropped from progress denominator", () => {
  const s = computeStats([
    { status: "done" },
    { status: "open" },
    { status: "dropped" },
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.dropped, 1);
  assert.equal(s.progressPct, 50);
});

test("groupByPhase splits and sorts phase keys", () => {
  const groups = groupByPhase([
    { id: "A-3", phase: 2 },
    { id: "A-1", phase: 0 },
    { id: "A-2", phase: 1 },
    { id: "A-4", phase: null },
  ]);
  assert.deepEqual(
    groups.map((g) => g.phase),
    [0, 1, 2, "unphased"],
  );
});

test("parseEpicPhases extracts phase headings", () => {
  const repo = setupRepo([
    { id: "DEMO-001", slug: "x", status: "open", phase: 0 },
  ]);
  const phases = parseEpicPhases(join(repo, "docs", "epics", "demo.md"));
  assert.equal(phases[0], "groundwork");
  assert.equal(phases[1], "ports");
  rmSync(repo, { recursive: true, force: true });
});

test("renderBurndown produces complete HTML with stats + tables", () => {
  const repo = setupRepo([
    {
      id: "DEMO-001",
      slug: "a",
      status: "done",
      phase: 0,
      title: "First done",
    },
    {
      id: "DEMO-002",
      slug: "b",
      status: "building",
      phase: 0,
      title: "Second mid",
    },
    {
      id: "DEMO-003",
      slug: "c",
      status: "open",
      phase: 1,
      title: "Third todo",
    },
  ]);
  const tickets = scanTickets(repo, "DEMO");
  const phaseTitles = parseEpicPhases(join(repo, "docs", "epics", "demo.md"));
  const html = renderBurndown({
    templatePath: TEMPLATE,
    epicTitle: "Demo Epic",
    epicSlug: "demo",
    epicPath: join(repo, "docs", "epics", "demo.md"),
    generatedDate: "2026-06-12",
    tickets,
    phaseTitles,
  });
  assert.match(html, /<title>Demo Epic — Burndown<\/title>/);
  assert.match(html, /First done/);
  assert.match(html, /Second mid/);
  assert.match(html, /Third todo/);
  assert.match(html, /Phase 0 · groundwork/);
  assert.match(html, /Phase 1 · ports/);
  assert.match(html, /badge-done/);
  assert.match(html, /badge-building/);
  assert.match(html, /\/md\?path=/);
  assert.match(html, /value="1"/);
  assert.match(html, /max="3"/);
  rmSync(repo, { recursive: true, force: true });
});

test("renderBurndown sets overall state to done when all tickets done", () => {
  const repo = setupRepo([
    { id: "DEMO-001", slug: "a", status: "done", phase: 0 },
    { id: "DEMO-002", slug: "b", status: "done", phase: 0 },
  ]);
  const tickets = scanTickets(repo, "DEMO");
  const html = renderBurndown({
    templatePath: TEMPLATE,
    epicTitle: "Done Epic",
    epicSlug: "done",
    epicPath: join(repo, "docs", "epics", "demo.md"),
    generatedDate: "2026-06-12",
    tickets,
    phaseTitles: { 0: "groundwork" },
  });
  assert.match(html, /badge-soft badge-done">done<\/span>/);
  rmSync(repo, { recursive: true, force: true });
});

console.log();
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
