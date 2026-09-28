import { symlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { serve } from "../../src/serve/server.ts";
import { addFolder } from "../../src/serve/state.ts";
import type { ServerHandle } from "../../src/types.ts";
import { mkTmpDir, nullLedger, stubParse, stubRenderPlain } from "./util.ts";

let handle: ServerHandle | undefined;

afterEach(async () => {
  await handle?.stop();
  handle = undefined;
});

describe("serve: traversal and symlink escape", () => {
  test("rejects .. traversal outside the remembered folder", async () => {
    const stateDir = await mkTmpDir("mate-doc-trav-state-");
    const secretRoot = await mkTmpDir("mate-doc-trav-secret-");
    await writeFile(join(secretRoot, "secret.md"), "top secret");

    const served = await mkTmpDir("mate-doc-trav-served-");
    await writeFile(join(served, "page.md"), "hello");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const traversal = relative(served, join(secretRoot, "secret.md")).replace(/\.md$/, "");
    const res = await fetch(`${handle.url}/${entry.alias}/${traversal}`);
    expect(res.status).toBe(404);
  });

  test("rejects a symlink that escapes the remembered folder", async () => {
    const stateDir = await mkTmpDir("mate-doc-symlink-state-");
    const outside = await mkTmpDir("mate-doc-symlink-outside-");
    await writeFile(join(outside, "private.md"), "private content");

    const served = await mkTmpDir("mate-doc-symlink-served-");
    await symlink(join(outside, "private.md"), join(served, "linked.md"));

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/linked`);
    expect(res.status).toBe(404);
  });

  test("serves a real file inside the remembered folder", async () => {
    const stateDir = await mkTmpDir("mate-doc-real-state-");
    const served = await mkTmpDir("mate-doc-real-served-");
    await writeFile(join(served, "page.md"), "---\ntitle: Hi\n---\nhello world");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/page`);
    expect(res.status).toBe(200);
  });
});
