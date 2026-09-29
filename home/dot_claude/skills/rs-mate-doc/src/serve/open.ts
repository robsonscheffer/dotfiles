// `mate-doc open <file-or-folder>`: remember the folder, make sure a server
// is running, then open the browser at the right page.
import { existsSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { Parse, Render, ServerHandle, Ledger } from "../types.ts";
import { PING_BODY, PING_PATH, pingIdentity, serve } from "./server.ts";
import {
  addFolder,
  clearPidFile,
  isPidAlive,
  readPidFile,
  realOrSelf,
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

type SpawnOutcome =
  | { kind: "up"; url: string }
  | { kind: "mismatch" } // something answers the port, but it isn't this state dir's viewer
  | { kind: "no-server" }; // nothing ever answered

// Spawns the viewer as its own detached process (see detached-server.ts), so the browser tab
// keeps working after this CLI invocation exits. Returns the base URL once the server answers,
// or "no-server" when it couldn't be spawned at all (no bun binary reachable, e.g. inside some
// sandboxes) so the caller can fall back to an in-process server.
async function trySpawnDetached(deps: OpenDeps): Promise<SpawnOutcome> {
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
    return { kind: "no-server" };
  }
  child.unref();
  const url = `http://127.0.0.1:${deps.port}`;
  const outcome = await waitForServer(url, deps.stateDir);
  // On a port collision the OS may let both processes bind (e.g. SO_REUSEPORT), so a mismatch
  // or a ping that never answers doesn't mean our own spawn failed to start: kill it rather
  // than leaving it running unreferenced.
  if (outcome === "mismatch" || outcome === "timeout") {
    try {
      child.kill();
    } catch {
      // already gone
    }
    return outcome === "mismatch" ? { kind: "mismatch" } : { kind: "no-server" };
  }
  await writePidFile(deps.stateDir, { pid: child.pid, port: deps.port, url });
  return { kind: "up", url };
}

async function waitForServer(
  url: string,
  stateDir: string,
  timeoutMs = 5000,
): Promise<"up" | "mismatch" | "timeout"> {
  const expected = `${PING_BODY}:${pingIdentity(stateDir)}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}${PING_PATH}`);
      if (res.ok) {
        const body = await res.text();
        if (body === expected) return "up";
        if (body.startsWith(`${PING_BODY}:`)) return "mismatch";
      }
      await new Promise((resolve_) => setTimeout(resolve_, 100));
    } catch {
      await new Promise((resolve_) => setTimeout(resolve_, 100));
    }
  }
  return "timeout";
}

// A single, non-retrying ping: used to decide whether an already-running process for this
// state dir is really this state dir's own viewer before we kill it.
async function pingOnce(url: string, stateDir: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}${PING_PATH}`);
    if (!res.ok) return false;
    return (await res.text()) === `${PING_BODY}:${pingIdentity(stateDir)}`;
  } catch {
    return false;
  }
}

// The pid listening on `port`, if lsof can tell. Unix only; null anywhere lsof is missing.
function listenerPid(port: number): number | null {
  try {
    const out = Bun.spawnSync({
      cmd: ["lsof", "-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"],
      stdout: "pipe",
      stderr: "ignore",
    });
    const pid = Number(out.stdout.toString().trim().split("\n")[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

// A viewer for this same state dir that this install can't recognise: started by an older
// mate-doc (no ping identity) or from another checkout, with its pid file lost. It holds the
// port forever and every `open` fails. Stop it, but only when its command line proves it is a
// mate-doc detached server for this exact state dir. Returns true once the port is free.
async function stopStaleViewer(port: number, stateDir: string): Promise<boolean> {
  const pid = listenerPid(port);
  if (pid === null || pid === process.pid) return false;
  let command: string;
  try {
    const out = Bun.spawnSync({ cmd: ["ps", "-o", "command=", "-p", String(pid)], stdout: "pipe" });
    command = out.stdout.toString().trim();
  } catch {
    return false;
  }
  const dirs = new Set([stateDir, realOrSelf(stateDir)]);
  const ours =
    command.includes("detached-server.ts") &&
    [...dirs].some((dir) => command.endsWith(`--state-dir ${dir}`));
  if (!ours) return false;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return false;
  }
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    await new Promise((resolve_) => setTimeout(resolve_, 50));
  }
  return false;
}

// Starts (or reuses) a server for the given state dir, then opens the
// browser at the page for `target`. A non-null handle means this call fell back to running
// the server in-process (the detach path failed) and the caller owns that handle's lifecycle;
// null means the server is either already running, or now running detached, either way owned
// by nobody in this process.
//
// `alias` (e.g. from `open <folder> --alias artifacts`) sets the remembered folder's URL
// segment instead of its basename; it only applies the first time a folder is remembered.
export async function openPath(
  target: string,
  deps: OpenDeps,
  alias?: string,
): Promise<OpenResult> {
  const abs = resolve(target);
  if (!existsSync(abs)) {
    throw new Error(`mate-doc open: no such file or folder: ${target}`);
  }
  const isDir = statSync(abs).isDirectory();
  const folderPath = isDir ? abs : dirname(abs);
  const folder = await addFolder(deps.stateDir, folderPath, alias);

  let pidInfo = await readPidFile(deps.stateDir);
  let handle: ServerHandle | null = null;
  let baseUrl: string;

  // A viewer left running on a port that no longer matches the configured one (for example
  // after MATE_DOC_PORT changed). Stop it, but only once we've confirmed by ping that it
  // really is this state dir's own viewer, not some other process that reused the pid.
  if (pidInfo && pidInfo.port !== deps.port && isPidAlive(pidInfo.pid)) {
    if (await pingOnce(pidInfo.url, deps.stateDir)) {
      try {
        process.kill(pidInfo.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    await clearPidFile(deps.stateDir);
    pidInfo = null;
  }

  if (pidInfo && isPidAlive(pidInfo.pid)) {
    baseUrl = pidInfo.url;
  } else {
    await stopStaleViewer(deps.port, deps.stateDir);
    const spawned = await trySpawnDetached(deps);
    if (spawned.kind === "up") {
      baseUrl = spawned.url;
    } else if (spawned.kind === "mismatch") {
      throw new Error(
        `port ${deps.port} is already taken by a different mate-doc viewer (a different state dir). ` +
          `Set MATE_DOC_PORT to a free port.`,
      );
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
