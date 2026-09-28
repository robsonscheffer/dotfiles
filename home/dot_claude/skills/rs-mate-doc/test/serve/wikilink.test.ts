import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { serve } from "../../src/serve/server.ts";
import { addFolder } from "../../src/serve/state.ts";
import type { ServerHandle } from "../../src/types.ts";
import { mkTmpDir, nullLedger, stubParse, stubRender } from "./util.ts";

let handle: ServerHandle | undefined;

afterEach(async () => {
  await handle?.stop();
  handle = undefined;
});

describe("serve: link resolution", () => {
  test("resolves a wikilink and a relative .md link within the folder", async () => {
    const stateDir = await mkTmpDir("mate-doc-wiki-state-");
    const served = await mkTmpDir("mate-doc-wiki-served-");
    await mkdir(join(served, "sub"));
    await writeFile(join(served, "target.md"), "---\ntitle: Target\n---\nbody");
    await writeFile(join(served, "sub", "nested.md"), "---\ntitle: Nested\n---\nbody");
    await writeFile(
      join(served, "start.md"),
      "---\ntitle: Start\n---\nSee [[Target]] and [nested](sub/nested.md).",
    );

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRender,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/start`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`<a href="/${entry.alias}/target">Target</a>`);
    expect(html).toContain(`<a href="/${entry.alias}/sub/nested">nested</a>`);
  });

  test("marks an unresolved wikilink visibly instead of silently dropping it", async () => {
    const stateDir = await mkTmpDir("mate-doc-wiki-unresolved-state-");
    const served = await mkTmpDir("mate-doc-wiki-unresolved-served-");
    await writeFile(
      join(served, "start.md"),
      "---\ntitle: Start\n---\nSee [[Nowhere]] for details.",
    );

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRender,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/start`);
    const html = await res.text();
    expect(html).toContain('<span class="unresolved">Nowhere</span>');
  });
});
