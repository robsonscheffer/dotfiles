// `mate-doc open <file-or-folder>`: remember the folder, make sure a server
// is running, then open the browser at the right page.
import { existsSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { Parse, Render, ServerHandle, Ledger } from "../types.ts";
import { serve } from "./server.ts";
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

// Starts (or reuses) a server for the given state dir, then opens the
// browser at the page for `target`. Callers own the handle's lifecycle when
// one is returned; when null, another process already owns the server.
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
    handle = await serve({
      host: "127.0.0.1",
      port: deps.port,
      stateDir: deps.stateDir,
      parse: deps.parse,
      render: deps.render,
      loadLedger: deps.loadLedger,
    });
    baseUrl = handle.url;
    await writePidFile(deps.stateDir, { pid: process.pid, port: deps.port, url: baseUrl });
  }

  const page = isDir ? "" : relative(folder.path, abs).replace(/\.md$/, "");
  const pageUrl = `${baseUrl}/${folder.alias}${page ? `/${page}` : "/"}`;
  deps.openBrowser(pageUrl);

  return { folder, url: pageUrl, handle };
}
