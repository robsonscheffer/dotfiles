// The viewer takes over the retired artifact-serving skill's job: serve existing .html files in remembered folders
// as-is, support an explicit alias so old /artifacts/... URLs keep resolving, and still 404 on
// traversal/symlink escape for .html the same as .md.
import { mkdir, symlink, writeFile } from "node:fs/promises";
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

describe("serve: static .html artifacts", () => {
  test("serves an .html file byte-for-byte with an html content type", async () => {
    const stateDir = await mkTmpDir("mate-doc-html-state-");
    const served = await mkTmpDir("mate-doc-html-served-");
    await mkdir(join(served, "report"), { recursive: true });
    const body = "<!doctype html><html><body>hello artifact</body></html>";
    await writeFile(join(served, "report", "thing.html"), body);

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/report/thing.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe(body);
  });

  test("an explicit alias resolves like the retired skill's /artifacts/ route", async () => {
    const stateDir = await mkTmpDir("mate-doc-html-alias-state-");
    const served = await mkTmpDir("mate-doc-html-alias-served-");
    await writeFile(join(served, "index.html"), "<html>index</html>");

    const entry = await addFolder(stateDir, served, "artifacts");
    expect(entry.alias).toBe("artifacts");

    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/artifacts/index.html`);
    expect(res.status).toBe(200);
  });

  test("an explicit alias still collides and numbers like any alias", async () => {
    const stateDir = await mkTmpDir("mate-doc-html-collide-state-");
    const servedA = await mkTmpDir("mate-doc-html-collide-a-");
    const servedB = await mkTmpDir("mate-doc-html-collide-b-");

    const first = await addFolder(stateDir, servedA, "artifacts");
    const second = await addFolder(stateDir, servedB, "artifacts");

    expect(first.alias).toBe("artifacts");
    expect(second.alias).toBe("artifacts-2");
  });

  test("rejects .. traversal outside the remembered folder for .html", async () => {
    const stateDir = await mkTmpDir("mate-doc-html-trav-state-");
    const secretRoot = await mkTmpDir("mate-doc-html-trav-secret-");
    await writeFile(join(secretRoot, "secret.html"), "top secret");

    const served = await mkTmpDir("mate-doc-html-trav-served-");
    await writeFile(join(served, "page.html"), "hello");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const traversal = relative(served, join(secretRoot, "secret.html"));
    const res = await fetch(`${handle.url}/${entry.alias}/${traversal}`);
    expect(res.status).toBe(404);
  });

  test("rejects a symlink that escapes the remembered folder for .html", async () => {
    const stateDir = await mkTmpDir("mate-doc-html-symlink-state-");
    const outside = await mkTmpDir("mate-doc-html-symlink-outside-");
    await writeFile(join(outside, "private.html"), "private content");

    const served = await mkTmpDir("mate-doc-html-symlink-served-");
    await symlink(join(outside, "private.html"), join(served, "linked.html"));

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/linked.html`);
    expect(res.status).toBe(404);
  });

  test("serves /style/main.css as the legacy stylesheet for old standalone artifacts", async () => {
    const stateDir = await mkTmpDir("mate-doc-html-style-state-");
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });
    const res = await fetch(`${handle.url}/style/main.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(await res.text()).toContain(".badge");
  });

  test("serves /style/mate-doc.css as the current theme stylesheet", async () => {
    const stateDir = await mkTmpDir("mate-doc-html-theme-style-state-");
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });
    const res = await fetch(`${handle.url}/style/mate-doc.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(await res.text()).toContain("--accent");
  });

  test("/md?path= 404s now that the legacy redirect is gone", async () => {
    const stateDir = await mkTmpDir("mate-doc-md-gone-state-");
    const served = await mkTmpDir("mate-doc-md-gone-served-");
    await mkdir(join(served, "notes"), { recursive: true });
    await writeFile(join(served, "notes", "index.md"), "# hi");
    await addFolder(stateDir, served);

    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const absPath = join(served, "notes", "index.md");
    const res = await fetch(`${handle.url}/md?path=${encodeURIComponent(absPath)}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(404);
  });
});
