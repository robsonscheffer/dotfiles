// Covers the fix for a page whose frontmatter fails to parse: the home index stays up (a
// registered folder with one good page and one bad page still lists both), and the page route
// itself renders the error instead of 500ing.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import { serve } from "../../src/serve/server.ts";
import { addFolder } from "../../src/serve/state.ts";
import type { ServerHandle } from "../../src/types.ts";
import { mkTmpDir, nullLedger } from "./util.ts";

let handle: ServerHandle | undefined;

afterEach(async () => {
  await handle?.stop();
  handle = undefined;
});

describe("serve: a page with bad frontmatter", () => {
  test("GET on the bad page returns 200 and shows the parse error instead of 500ing", async () => {
    const stateDir = await mkTmpDir("mate-doc-badfm-state-");
    const served = await mkTmpDir("mate-doc-badfm-served-");
    await writeFile(join(served, "good.md"), "---\ntitle: Good\n---\nbody");
    await writeFile(join(served, "bad.md"), "---\ntitle: a: b: [\n---\nbody");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse,
      render,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/bad`);
    expect(res.status).toBeLessThan(500);
    const html = await res.text();
    expect(html).toContain('<div class="doc-error">');
    expect(html).toContain("YAML Parse error");
  });

  test("GET on a good page in the same folder as a bad one still renders, unaffected", async () => {
    const stateDir = await mkTmpDir("mate-doc-badfm-state-");
    const served = await mkTmpDir("mate-doc-badfm-served-");
    await writeFile(join(served, "good.md"), "---\ntitle: Good\n---\nbody");
    await writeFile(join(served, "bad.md"), "---\ntitle: a: b: [\n---\nbody");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse,
      render,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/good`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Good");
    expect(html).not.toContain('<div class="doc-error">');
  });
});
