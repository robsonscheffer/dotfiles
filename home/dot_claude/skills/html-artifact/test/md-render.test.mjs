#!/usr/bin/env node
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { strict as assert } from "assert";
import { renderMarkdownFile, resolveMdPath } from "../lib/md-render.mjs";

const tmp = mkdtempSync(join(tmpdir(), "md-render-"));
const allowedRoots = [tmp];
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

test("resolveMdPath rejects missing path", () => {
  const r = resolveMdPath(null, allowedRoots);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("resolveMdPath rejects non-.md extension", () => {
  const f = join(tmp, "x.txt");
  writeFileSync(f, "");
  const r = resolveMdPath(f, allowedRoots);
  assert.equal(r.ok, false);
  assert.equal(r.status, 415);
});

test("resolveMdPath rejects path outside roots", () => {
  const r = resolveMdPath("/etc/passwd.md", allowedRoots);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("resolveMdPath rejects directory-traversal", () => {
  const r = resolveMdPath(`${tmp}/../../../etc/passwd.md`, allowedRoots);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("resolveMdPath returns 404 for missing file", () => {
  const r = resolveMdPath(join(tmp, "missing.md"), allowedRoots);
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
});

test("resolveMdPath accepts valid in-root .md", () => {
  const f = join(tmp, "ok.md");
  writeFileSync(f, "# hi");
  const r = resolveMdPath(f, allowedRoots);
  assert.equal(r.ok, true);
  assert.equal(r.absolute, f);
});

test("renderMarkdownFile parses frontmatter into rail", () => {
  const f = join(tmp, "with-fm.md");
  writeFileSync(
    f,
    `---
id: TEST-001
status: open
needs: spec
---

# Title

body paragraph.`,
  );
  const html = renderMarkdownFile(f, allowedRoots);
  assert.match(html, /TEST-001/);
  assert.match(html, /spec-rail-label[^>]*>id</);
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<p>body paragraph\.<\/p>/);
});

test("renderMarkdownFile derives title from frontmatter id", () => {
  const f = join(tmp, "id-title.md");
  writeFileSync(f, "---\nid: ABC-9\n---\n\nno h1 here.");
  const html = renderMarkdownFile(f, allowedRoots);
  assert.match(html, /<title>ABC-9<\/title>/);
});

test("renderMarkdownFile falls back to h1 when no frontmatter title", () => {
  const f = join(tmp, "h1-title.md");
  writeFileSync(f, "# From H1\n\nbody");
  const html = renderMarkdownFile(f, allowedRoots);
  assert.match(html, /<title>From H1<\/title>/);
});

test("renderMarkdownFile rewrites relative .md links to /md route", () => {
  const src = join(tmp, "a.md");
  const target = join(tmp, "b.md");
  writeFileSync(target, "# B");
  writeFileSync(src, "Link to [B](./b.md).");
  const html = renderMarkdownFile(src, allowedRoots);
  assert.match(html, /href="\/md\?path=/);
  const expected = encodeURIComponent(target).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  assert.match(html, new RegExp(expected));
});

test("renderMarkdownFile preserves fragment in rewritten link", () => {
  const src = join(tmp, "a2.md");
  const target = join(tmp, "b2.md");
  writeFileSync(target, "# B");
  writeFileSync(src, "Link to [B](./b2.md#section).");
  const html = renderMarkdownFile(src, allowedRoots);
  assert.match(html, /#section"/);
});

test("renderMarkdownFile does NOT rewrite http links", () => {
  const f = join(tmp, "http.md");
  writeFileSync(f, "External [link](https://example.com/page.md).");
  const html = renderMarkdownFile(f, allowedRoots);
  assert.match(html, /href="https:\/\/example\.com\/page\.md"/);
});

test("renderMarkdownFile does NOT rewrite out-of-allowlist .md links", () => {
  const f = join(tmp, "out.md");
  writeFileSync(f, "Out [link](/etc/some.md).");
  const html = renderMarkdownFile(f, allowedRoots);
  assert.match(html, /href="\/etc\/some\.md"/);
});

test("renderMarkdownFile escapes HTML in frontmatter values", () => {
  const f = join(tmp, "xss.md");
  writeFileSync(f, '---\ntitle: "<script>alert(1)</script>"\n---\n\n# body');
  const html = renderMarkdownFile(f, allowedRoots);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("renderMarkdownFile detects ticket context and renders prev/next", () => {
  const repo = join(tmp, "ticket-repo-1");
  for (const id of ["DEMO-001", "DEMO-002", "DEMO-003"]) {
    const dir = join(repo, "docs", "plans", "active", `${id}-slug`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "README.md"),
      `---\nid: ${id}\nstatus: open\nneeds: spec\nepic: docs/epics/demo.md\n---\n\n# ${id}\n`,
    );
  }
  const epicDir = join(repo, "docs", "epics");
  mkdirSync(epicDir, { recursive: true });
  writeFileSync(join(epicDir, "demo.md"), "# Demo Epic\n");
  const middle = join(
    repo,
    "docs",
    "plans",
    "active",
    "DEMO-002-slug",
    "README.md",
  );
  const html = renderMarkdownFile(middle, [repo]);
  assert.match(html, /DEMO-001/);
  assert.match(html, /DEMO-003/);
  assert.match(html, /<nav class="md-context-nav"/);
  assert.match(html, /demo\.md/);
});

test("renderMarkdownFile detects epic context", () => {
  const repo = join(tmp, "epic-repo-1");
  mkdirSync(join(repo, "docs", "epics"), { recursive: true });
  const epic = join(repo, "docs", "epics", "test-epic.md");
  writeFileSync(epic, "# Test Epic\n\nbody");
  const html = renderMarkdownFile(epic, [repo]);
  assert.match(html, /epic \/ test-epic/);
  assert.match(html, /<nav class="md-context-nav"/);
});

test("renderMarkdownFile renders generic md without context-nav", () => {
  const f = join(tmp, "loose.md");
  writeFileSync(f, "# Loose note\n\nbody");
  const html = renderMarkdownFile(f, allowedRoots);
  assert.doesNotMatch(html, /<nav class="md-context-nav"/);
});

test("renderMarkdownFile renders tables, code, lists", () => {
  const f = join(tmp, "rich.md");
  writeFileSync(
    f,
    "| a | b |\n|---|---|\n| 1 | 2 |\n\n- item\n\n`code`\n\n```js\nconst x = 1;\n```",
  );
  const html = renderMarkdownFile(f, allowedRoots);
  assert.match(html, /<table>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<pre>/);
});

rmSync(tmp, { recursive: true, force: true });

console.log();
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
