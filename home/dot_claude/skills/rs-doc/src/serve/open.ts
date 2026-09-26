// `mate-doc open <file-or-folder>`: remember the folder, make sure a server
// is running, then open the browser at the right page.
import { existsSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { Parse, Render, ServerHandle, Ledger } from "../types.ts";
import { PING_BODY, PING_PATH, serve } from "./server.ts";
import {
  addFolder,
  isPidAlive,
  readPidFile,
  writePidFile,
  type RememberedFolder,
} from "./state.ts";

export interface OpenDeps {
  stateDir: string;
  port: number;
  parse: Parse;
  render: Render;
  loadLedger: (docDir: string) => Ledger | null;
  openBrowser: (url: string) => void;
}

export interface OpenResult {
  folder: RememberedFolder;
  url: string;
  handle: ServerHandle | null; // non-null only when this call started the server
}

// Spawns the viewer as its own detached process (see detached-server.ts), so the browser tab
// keeps working after this CLI invocation exits. Returns the base URL once the server answers,
// or null when it couldn't be spawned at all (no bun binary reachable, e.g. inside some
// sandboxes) so the caller can fall back to an in-process server.
async function trySpawnDetached(deps: OpenDeps): Promise<string | null> {
  const scriptPath = new URL("./detached-server.ts", import.meta.url).pathname;
  const bun = process.execPath;
  let child: ReturnType<typeof Bun.spawn>;
  try {
    child = Bun.spawn({
      cmd: [bun, scriptPath, "--port", String(deps.port), "--state-dir", deps.stateDir],
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
  } catch {
    return null;
  }
  child.unref();
  const url = `http://127.0.0.1:${deps.port}`;
  const up = await waitForServer(url);
  if (!up) return null;
  await writePidFile(deps.stateDir, { pid: child.pid, port: deps.port, url });
  return url;
}

async function waitForServer(url: string, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Any answer is not enough: another program on the port would pass. Only our ping counts.
      const res = await fetch(`${url}${PING_PATH}`);
      if (res.ok && (await res.text()) === PING_BODY) return true;
      await new Promise((resolve_) => setTimeout(resolve_, 100));
    } catch {
      await new Promise((resolve_) => setTimeout(resolve_, 100));
    }
  }
  return false;
}

// Starts (or reuses) a server for the given state dir, then opens the
// browser at the page for `target`. A non-null handle means this call fell back to running
// the server in-process (the detach path failed) and the caller owns that handle's lifecycle;
// null means the server is either already running, or now running detached, either way owned
// by nobody in this process.
export async function openPath(target: string, deps: OpenDeps): Promise<OpenResult> {
  const abs = resolve(target);
  if (!existsSync(abs)) {
    throw new Error(`mate-doc open: no such file or folder: ${target}`);
  }
  const isDir = statSync(abs).isDirectory();
  const folderPath = isDir ? abs : dirname(abs);
  const folder = await addFolder(deps.stateDir, folderPath);

  const pidInfo = await readPidFile(deps.stateDir);
  let handle: ServerHandle | null = null;
  let baseUrl: string;

  if (pidInfo && isPidAlive(pidInfo.pid)) {
    baseUrl = pidInfo.url;
  } else {
    const spawned = await trySpawnDetached(deps);
    if (spawned) {
      baseUrl = spawned;
    } else {
      try {
        handle = await serve({
          host: "127.0.0.1",
          port: deps.port,
          stateDir: deps.stateDir,
          parse: deps.parse,
          render: deps.render,
          loadLedger: deps.loadLedger,
        });
      } catch (err) {
        throw new Error(
          `port ${deps.port} is taken by something that isn't a mate-doc viewer. ` +
            `Set MATE_DOC_PORT to a free port. (${(err as Error).message})`,
        );
      }
      baseUrl = handle.url;
      await writePidFile(deps.stateDir, { pid: process.pid, port: deps.port, url: baseUrl });
    }
  }

  const page = isDir ? "" : relative(folder.path, abs).replace(/\.md$/, "");
  const pageUrl = `${baseUrl}/${folder.alias}${page ? `/${page}` : "/"}`;
  deps.openBrowser(pageUrl);

  return { folder, url: pageUrl, handle };
}
