import { afterEach, describe, expect, test } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectHomeEntries, createHomeCache } from "../../src/index/collect.ts";
import { INDEX_KINDS } from "../../src/index/types.ts";
import { parse } from "../../src/parser/index.ts";
import { serve } from "../../src/serve/server.ts";
import { addFolder } from "../../src/serve/state.ts";
import type { ServerHandle } from "../../src/types.ts";
import { mkTmpDir, nullLedger, stubParse, stubRenderPlain } from "./util.ts";

let handle: ServerHandle | undefined;

afterEach(async () => {
  await handle?.stop();
  handle = undefined;
});

async function makeDocSet(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-home-docset-");
  await writeFile(
    join(dir, "index.md"),
    "---\ntitle: Orders guide\nsummary: How orders flow\nkind: guide\nstatus: audited\n---\nbody",
  );
  await writeFile(
    join(dir, "claims.yaml"),
    'claims:\n  - id: C1\n    claim: "orders flow through the queue"\n    status: verified\n    evidence:\n      kind: code\n      needs: git\n      ref: "acme/console@main:src/orders.ts:1"\n    checked_by: "agent:test"\n    checked_at: "2026-09-01"\n',
  );
  return dir;
}

async function makeLoosePages(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-home-pages-");
  await writeFile(join(dir, "checkout.md"), "---\ntitle: Checkout\nsummary: Checkout page\n---\nbody");
  return dir;
}

async function makeLegacyHtml(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-home-legacy-");
  await writeFile(join(dir, "old.html"), "<html><head><title>Old dashboard</title></head><body></body></html>");
  return dir;
}

describe("serve: home index", () => {
  test("lists a doc set, a loose page, and a legacy html page with the right kinds", async () => {
    const stateDir = await mkTmpDir("mate-doc-home-state-");
    const docSet = await makeDocSet();
    const pages = await makeLoosePages();
    const legacy = await makeLegacyHtml();

    await addFolder(stateDir, docSet);
    await addFolder(stateDir, pages);
    await addFolder(stateDir, legacy);

    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain("Orders guide");
    expect(html).toContain('data-kind="guide"');
    expect(html).toContain("Checkout");
    expect(html).toContain('data-kind="page"');
    expect(html).toContain("Old dashboard");
    expect(html).toContain('data-kind="legacy"');
  });

  test("renders a kind filter and a search box whose data attributes cover every entry, so the no-script list still shows everything", async () => {
    const stateDir = await mkTmpDir("mate-doc-home-state-");
    const docSet = await makeDocSet();
    await addFolder(stateDir, docSet);

    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/`);
    const html = await res.text();

    expect(html).toContain('id="index-kind"');
    expect(html).toContain('id="index-search"');
    expect(html).toContain('data-title="orders guide"');
    expect(html).toContain('data-summary="how orders flow"');
    // No inline display:none on any entry: everything starts visible, filtering is applied
    // only by the inline script reacting to input, so a script-off client sees it all. (The
    // shared stylesheet's own print rules use display: none for chrome like nav/TOC, which is
    // unrelated to this filter and is not scoped to .index-entry.)
    const entryTags = html.match(/<li class="index-entry"[^>]*>/g) ?? [];
    expect(entryTags.length).toBeGreaterThan(0);
    for (const tag of entryTags) {
      expect(tag).not.toContain("display: none");
      expect(tag).not.toContain("display:none");
    }
  });

  test("the kind filter includes every kind the collector can emit, including plain", async () => {
    const stateDir = await mkTmpDir("mate-doc-home-state-");
    const docSet = await makeDocSet();
    await addFolder(stateDir, docSet);

    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/`);
    const html = await res.text();
    for (const kind of INDEX_KINDS) {
      expect(html).toContain(`<option value="${kind}">`);
    }
  });

  test("a doc set with a fresh claims.yaml is marked fresh", async () => {
    const stateDir = await mkTmpDir("mate-doc-home-state-");
    const docSet = await makeDocSet();
    await addFolder(stateDir, docSet);

    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/`);
    const html = await res.text();
    expect(html).toContain("status-fresh");
  });
});

async function makeMixedFrontmatterPages(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-home-badfm-");
  await writeFile(join(dir, "good.md"), "---\ntitle: Good page\nsummary: fine\n---\nbody");
  await writeFile(join(dir, "bad.md"), "---\ntitle: a: b: [\n---\nbody");
  return dir;
}

describe("serve: home index with bad frontmatter", () => {
  test("a folder with one good page and one bad-frontmatter page returns 200 and lists both, the bad one flagged", async () => {
    const stateDir = await mkTmpDir("mate-doc-home-state-");
    const pages = await makeMixedFrontmatterPages();
    await addFolder(stateDir, pages);

    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain("Good page");
    expect(html).toContain(">bad<"); // falls back to the file name
    expect(html).toContain('class="status-banner status-error"');
    expect(html).toContain("YAML Parse error");
  });

  test("collectHomeEntries never throws when a page's frontmatter fails to parse", async () => {
    const pages = await makeMixedFrontmatterPages();
    const cache = createHomeCache();
    const folders = [{ path: pages, alias: "docs" }];

    const entries = await collectHomeEntries(folders, parse, cache);
    expect(entries).toHaveLength(2);
    const bad = entries.find((e) => e.title === "bad");
    expect(bad?.frontmatterError).toContain("YAML Parse error");
    const good = entries.find((e) => e.title === "Good page");
    expect(good?.frontmatterError).toBeUndefined();
  });
});

describe("collectHomeEntries: cache", () => {
  test("a second call with nothing changed on disk does not re-read frontmatter", async () => {
    const docSet = await makeDocSet();
    let parseCalls = 0;
    const countingParse: typeof stubParse = (src, path) => {
      parseCalls += 1;
      return stubParse(src, path);
    };
    const cache = createHomeCache();
    const folders = [{ path: docSet, alias: "orders" }];

    await collectHomeEntries(folders, countingParse, cache);
    expect(parseCalls).toBe(1);

    await collectHomeEntries(folders, countingParse, cache);
    expect(parseCalls).toBe(1);
  });

  test("a changed file on disk invalidates the cache and re-reads frontmatter", async () => {
    const docSet = await makeDocSet();
    let parseCalls = 0;
    const countingParse: typeof stubParse = (src, path) => {
      parseCalls += 1;
      return stubParse(src, path);
    };
    const cache = createHomeCache();
    const folders = [{ path: docSet, alias: "orders" }];

    await collectHomeEntries(folders, countingParse, cache);
    expect(parseCalls).toBe(1);

    await writeFile(join(docSet, "index.md"), "---\ntitle: Orders guide v2\n---\nbody");
    await collectHomeEntries(folders, countingParse, cache);
    expect(parseCalls).toBe(2);
  });

  test("a registered folder deleted from disk is skipped, and the home page still lists the rest", async () => {
    const stateDir = await mkTmpDir("mate-doc-home-state-");
    const docSet = await makeDocSet();
    const gone = await makeLoosePages();
    await addFolder(stateDir, docSet);
    await addFolder(stateDir, gone);
    await rm(gone, { recursive: true, force: true });

    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Orders guide");
    expect(html).not.toContain("Checkout");
  });
});

describe("serve: home status colors", () => {
  test("the stale label uses the dark-safe text token, not the raw badge fill color", async () => {
    const { renderHome } = await import("../../src/serve/home.ts");
    const html = renderHome([]);
    expect(html).toContain(".status-stale { border-color: var(--badge-high-text); color: var(--badge-high-text); }");
    expect(html).not.toContain(".status-stale { border-color: var(--badge-high);");
  });
});
