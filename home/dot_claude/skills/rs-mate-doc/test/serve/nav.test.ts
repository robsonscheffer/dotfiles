import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { serve } from "../../src/serve/server.ts";
import { addFolder } from "../../src/serve/state.ts";
import type { Frontmatter, Parse, ServerHandle } from "../../src/types.ts";
import { mkTmpDir, nullLedger, stubParse, stubRenderNav } from "./util.ts";

// `tour: [index, b, a]` is one YAML flow-sequence line; the base stubParse only reads
// scalar values, so unpack it here rather than teaching every serve test about arrays.
const parseWithTour: Parse = (src, path) => {
  const doc = stubParse(src, path);
  const raw = (doc.frontmatter.extra as Record<string, unknown>).tour;
  if (typeof raw === "string") {
    const items = raw
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    (doc.frontmatter as Frontmatter).tour = items;
  }
  return doc;
};

let handle: ServerHandle | undefined;

afterEach(async () => {
  await handle?.stop();
  handle = undefined;
});

describe("serve: folder nav", () => {
  test("tour order drives side nav, current marker, and prev/next", async () => {
    const stateDir = await mkTmpDir("mate-doc-nav-state-");
    const served = await mkTmpDir("mate-doc-nav-served-");
    await writeFile(join(served, "index.md"), "---\ntitle: Index\ntour: [index, b, a]\n---\nbody");
    await writeFile(join(served, "a.md"), "---\ntitle: A\n---\nbody");
    await writeFile(join(served, "b.md"), "---\ntitle: B\n---\nbody");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: parseWithTour,
      render: stubRenderNav,
      loadLedger: nullLedger,
    });

    const indexRes = await fetch(`${handle.url}/${entry.alias}/index`);
    expect(indexRes.status).toBe(200);
    const indexHtml = await indexRes.text();
    expect(indexHtml).toContain(
      `<li class="current"><a href="/${entry.alias}/index">Index</a></li>` +
        `<li class=""><a href="/${entry.alias}/b">B</a></li>` +
        `<li class=""><a href="/${entry.alias}/a">A</a></li>`,
    );
    expect(indexHtml).not.toContain('class="prev"');
    expect(indexHtml).toContain(`<a class="next" href="/${entry.alias}/b">B</a>`);

    const bRes = await fetch(`${handle.url}/${entry.alias}/b`);
    expect(bRes.status).toBe(200);
    const bHtml = await bRes.text();
    expect(bHtml).toContain(`<li class="current"><a href="/${entry.alias}/b">B</a></li>`);
    expect(bHtml).toContain(`<a class="prev" href="/${entry.alias}/index">Index</a>`);
    expect(bHtml).toContain(`<a class="next" href="/${entry.alias}/a">A</a>`);

    const aRes = await fetch(`${handle.url}/${entry.alias}/a`);
    expect(aRes.status).toBe(200);
    const aHtml = await aRes.text();
    expect(aHtml).toContain(`<li class="current"><a href="/${entry.alias}/a">A</a></li>`);
    expect(aHtml).toContain(`<a class="prev" href="/${entry.alias}/b">B</a>`);
    expect(aHtml).not.toContain('class="next"');
  });

  test("breadcrumbs link the folder alias then show the page title", async () => {
    const stateDir = await mkTmpDir("mate-doc-nav-crumb-state-");
    const served = await mkTmpDir("mate-doc-nav-crumb-served-");
    await writeFile(join(served, "index.md"), "---\ntitle: Landing\n---\nbody");
    await writeFile(join(served, "other.md"), "---\ntitle: Other\n---\nbody");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderNav,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/other`);
    const html = await res.text();
    expect(html).toContain(
      `<nav class="breadcrumbs"><a href="/${entry.alias}/">${entry.alias}</a> / ` +
        `<a href="/${entry.alias}/other">Other</a></nav>`,
    );
  });

  test("no tour: alphabetical order with index first", async () => {
    const stateDir = await mkTmpDir("mate-doc-nav-alpha-state-");
    const served = await mkTmpDir("mate-doc-nav-alpha-served-");
    await writeFile(join(served, "index.md"), "---\ntitle: Index\n---\nbody");
    await writeFile(join(served, "zeta.md"), "---\ntitle: Zeta\n---\nbody");
    await writeFile(join(served, "alpha.md"), "---\ntitle: Alpha\n---\nbody");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderNav,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/index`);
    const html = await res.text();
    expect(html).toContain(
      `<li class="current"><a href="/${entry.alias}/index">Index</a></li>` +
        `<li class=""><a href="/${entry.alias}/alpha">Alpha</a></li>` +
        `<li class=""><a href="/${entry.alias}/zeta">Zeta</a></li>`,
    );
  });

  test("a single-page folder renders no nav", async () => {
    const stateDir = await mkTmpDir("mate-doc-nav-single-state-");
    const served = await mkTmpDir("mate-doc-nav-single-served-");
    await writeFile(join(served, "index.md"), "---\ntitle: Solo\n---\nbody");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderNav,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/index`);
    const html = await res.text();
    expect(html).toContain('<span class="no-nav"></span>');
    expect(html).not.toContain("left-nav");
  });

  test("adding a page shows up in nav on the next request", async () => {
    const stateDir = await mkTmpDir("mate-doc-nav-add-state-");
    const served = await mkTmpDir("mate-doc-nav-add-served-");
    await writeFile(join(served, "index.md"), "---\ntitle: Index\n---\nbody");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderNav,
      loadLedger: nullLedger,
    });

    const before = await (await fetch(`${handle.url}/${entry.alias}/index`)).text();
    expect(before).toContain('<span class="no-nav"></span>');

    await writeFile(join(served, "second.md"), "---\ntitle: Second\n---\nbody");

    const after = await (await fetch(`${handle.url}/${entry.alias}/index`)).text();
    expect(after).toContain(`<li class="current"><a href="/${entry.alias}/index">Index</a></li>`);
    expect(after).toContain(`<a href="/${entry.alias}/second">Second</a>`);
  });

  test("adding a subfolder page does not appear in the parent folder's nav", async () => {
    const stateDir = await mkTmpDir("mate-doc-nav-scope-state-");
    const served = await mkTmpDir("mate-doc-nav-scope-served-");
    await writeFile(join(served, "index.md"), "---\ntitle: Index\n---\nbody");
    await writeFile(join(served, "other.md"), "---\ntitle: Other\n---\nbody");
    await mkdir(join(served, "sub"));
    await writeFile(join(served, "sub", "child.md"), "---\ntitle: Child\n---\nbody");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderNav,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/index`);
    const html = await res.text();
    expect(html).not.toContain("Child");
  });
});
