import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openPath } from "../../src/serve/open.ts";
import { writePidFile } from "../../src/serve/state.ts";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import type { Ledger } from "../../src/types.ts";
import { mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
async function tempDir(prefix: string): Promise<string> {
  const dir = await mkTmpDir(prefix);
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

describe("open: reusing a live pid", () => {
  test("never spawns a new server when the pid file points at a live process", async () => {
    const stateDir = await tempDir("mate-doc-open-state-");
    const served = await tempDir("mate-doc-open-served-");
    writeFileSync(join(served, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");

    // process.pid (this very test process) is always alive, so the reuse branch fires and the
    // spawn/in-process-serve branch never runs: no real port ever gets bound.
    await writePidFile(stateDir, { pid: process.pid, port: 59999, url: "http://127.0.0.1:59999" });

    const opened: string[] = [];
    const result = await openPath(served, {
      stateDir,
      port: 59999,
      parse,
      render,
      loadLedger: (): Ledger | null => null,
      openBrowser: (url: string) => opened.push(url),
    });

    expect(result.handle).toBeNull();
    expect(result.url).toBe("http://127.0.0.1:59999/" + result.folder.alias + "/");
    expect(opened).toEqual([result.url]);
  });

  test("an explicit alias sets the folder's URL segment", async () => {
    const stateDir = await tempDir("mate-doc-open-alias-state-");
    const served = await tempDir("mate-doc-open-alias-served-");
    writeFileSync(join(served, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");

    await writePidFile(stateDir, { pid: process.pid, port: 59998, url: "http://127.0.0.1:59998" });

    const result = await openPath(
      served,
      {
        stateDir,
        port: 59998,
        parse,
        render,
        loadLedger: (): Ledger | null => null,
        openBrowser: () => {},
      },
      "artifacts",
    );

    expect(result.folder.alias).toBe("artifacts");
    expect(result.url).toBe("http://127.0.0.1:59998/artifacts/");
  });
});

describe("open: a port held by another program", () => {
  test("refuses to treat a foreign server as the viewer", async () => {
    const stateDir = await tempDir("mate-doc-open-state-");
    const served = await tempDir("mate-doc-open-served-");
    writeFileSync(join(served, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");

    // Something else (like a dashboard) already answers every request on the port.
    const squatter = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("not us") });
    try {
      const opened: string[] = [];
      const attempt = openPath(served, {
        stateDir,
        port: squatter.port!,
        parse,
        render,
        loadLedger: (): Ledger | null => null,
        openBrowser: (url: string) => opened.push(url),
      });
      await expect(attempt).rejects.toThrow(/isn't a mate-doc viewer/);
      expect(opened).toEqual([]);
    } finally {
      squatter.stop(true);
    }
  }, 20_000);
});
