import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openPath } from "../../src/serve/open.ts";
import { serve } from "../../src/serve/server.ts";
import { readPidFile, writePidFile } from "../../src/serve/state.ts";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import type { Ledger, ServerHandle } from "../../src/types.ts";
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

  test("refuses to reuse a different mate-doc viewer's state dir on the same port", async () => {
    const stateDirA = await tempDir("mate-doc-open-mismatch-state-a-");
    const stateDirB = await tempDir("mate-doc-open-mismatch-state-b-");
    const served = await tempDir("mate-doc-open-mismatch-served-");
    writeFileSync(join(served, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");

    let handle: ServerHandle | null = null;
    try {
      handle = await serve({
        host: "127.0.0.1",
        port: 0,
        stateDir: stateDirA,
        parse,
        render,
        loadLedger: (): Ledger | null => null,
      });
      const port = Number(new URL(handle.url).port);

      const opened: string[] = [];
      const attempt = openPath(served, {
        stateDir: stateDirB,
        port,
        parse,
        render,
        loadLedger: (): Ledger | null => null,
        openBrowser: (url: string) => opened.push(url),
      });
      await expect(attempt).rejects.toThrow(/different mate-doc viewer/);
      expect(opened).toEqual([]);
      expect(await readPidFile(stateDirB)).toBeNull();
    } finally {
      await handle?.stop();
    }
  }, 20_000);
});

describe("open: a stale pid file on the wrong port", () => {
  test("stops its own viewer and starts fresh when the configured port changed", async () => {
    const stateDir = await tempDir("mate-doc-open-stale-port-state-");
    const served = await tempDir("mate-doc-open-stale-port-served-");
    writeFileSync(join(served, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");

    // A free port, grabbed and released, then handed to a real detached child process (not this
    // test process) so the fix's process.kill() has something real to terminate.
    const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
    const oldPort = probe.port!;
    probe.stop(true);

    const scriptPath = new URL("../../src/serve/detached-server.ts", import.meta.url).pathname;
    const child = Bun.spawn({
      cmd: [process.execPath, scriptPath, "--port", String(oldPort), "--state-dir", stateDir],
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    const oldUrl = `http://127.0.0.1:${oldPort}`;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${oldUrl}/`)).ok) break;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    await writePidFile(stateDir, { pid: child.pid, port: oldPort, url: oldUrl });

    let handle: ServerHandle | null = null;
    try {
      const result = await openPath(served, {
        stateDir,
        port: 0,
        parse,
        render,
        loadLedger: (): Ledger | null => null,
        openBrowser: () => {},
      });
      handle = result.handle;

      // The stale pid entry (still pointing at oldPort) is gone; a fresh one was written.
      const pidInfo = await readPidFile(stateDir);
      expect(pidInfo?.port).not.toBe(oldPort);

      // The old child was stopped, not just abandoned.
      const stillUp = await fetch(oldUrl).catch(() => null);
      expect(stillUp).toBeNull();

      // openPath detached its own fresh server (handle is null on that path): stop it via the
      // pid it just wrote, the same way a real caller would on shutdown.
      if (pidInfo && pidInfo.pid !== process.pid) {
        try {
          process.kill(pidInfo.pid, "SIGTERM");
        } catch {
          // already gone
        }
      }
    } finally {
      await handle?.stop();
      try {
        child.kill();
      } catch {
        // already gone
      }
    }
  }, 20_000);
});
