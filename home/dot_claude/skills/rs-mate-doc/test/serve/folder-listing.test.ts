import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

describe("serve: folder listing", () => {
  test("lists pages with frontmatter and subfolders when there is no index.md", async () => {
    const stateDir = await mkTmpDir("mate-doc-listing-state-");
    const served = await mkTmpDir("mate-doc-listing-served-");
    await writeFile(
      join(served, "orders.md"),
      "---\ntitle: Orders\nsummary: How orders flow\nstatus: audited\n---\nbody",
    );
    await writeFile(join(served, "checkout.md"), "---\ntitle: Checkout\n---\nbody");
    await mkdir(join(served, "subteam"));

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Orders");
    expect(html).toContain("How orders flow");
    expect(html).toContain("audited");
    expect(html).toContain("Checkout");
    expect(html).toContain("subteam");
  });

  test("serves index.md as the landing page when present", async () => {
    const stateDir = await mkTmpDir("mate-doc-index-state-");
    const served = await mkTmpDir("mate-doc-index-served-");
    await writeFile(join(served, "index.md"), "---\ntitle: Landing\n---\nwelcome");
    await writeFile(join(served, "other.md"), "---\ntitle: Other\n---\nbody");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    const res = await fetch(`${handle.url}/${entry.alias}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toBe("<html>stub</html>");
  });
});
