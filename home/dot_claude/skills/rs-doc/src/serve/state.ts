// Folder registry and pid file, persisted under a state dir (default
// ~/.local/state/mate-doc, overridable for tests).
import { realpathSync, existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

export interface RememberedFolder {
  path: string; // realpath, absolute
  alias: string;
}

export interface FoldersState {
  folders: RememberedFolder[];
}

export function defaultStateDir(): string {
  if (process.env.MATE_DOC_STATE_DIR) return process.env.MATE_DOC_STATE_DIR;
  if (process.env.XDG_STATE_HOME) return join(process.env.XDG_STATE_HOME, "mate-doc");
  const home = process.env.HOME ?? "";
  return join(home, ".local", "state", "mate-doc");
}

function foldersFile(stateDir: string): string {
  return join(stateDir, "folders.json");
}

function pidFile(stateDir: string): string {
  return join(stateDir, "server.pid");
}

export async function loadFolders(stateDir: string): Promise<FoldersState> {
  try {
    const text = await readFile(foldersFile(stateDir), "utf8");
    const parsed = JSON.parse(text) as FoldersState;
    if (!parsed || !Array.isArray(parsed.folders)) return { folders: [] };
    return parsed;
  } catch {
    return { folders: [] };
  }
}

export async function saveFolders(stateDir: string, state: FoldersState): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  await writeFile(foldersFile(stateDir), JSON.stringify(state, null, 2));
}

export function realOrSelf(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function aliasFor(state: FoldersState, desired: string): string {
  const taken = new Set(state.folders.map((f) => f.alias));
  if (!taken.has(desired)) return desired;
  let n = 2;
  while (taken.has(`${desired}-${n}`)) n += 1;
  return `${desired}-${n}`;
}

// Adds a folder to the registry (idempotent by realpath) and returns its alias.
// An explicit `alias` (e.g. from `open <folder> --alias artifacts`) is used as the desired
// alias instead of the folder's basename; it still collides and numbers like any alias.
export async function addFolder(
  stateDir: string,
  folderPath: string,
  alias?: string,
): Promise<RememberedFolder> {
  const real = realOrSelf(folderPath);
  const state = await loadFolders(stateDir);
  const existing = state.folders.find((f) => f.path === real);
  if (existing) return existing;
  const desired = alias || basename(real) || "root";
  const resolvedAlias = aliasFor(state, desired);
  const entry: RememberedFolder = { path: real, alias: resolvedAlias };
  state.folders.push(entry);
  await saveFolders(stateDir, state);
  return entry;
}

// Removes a folder by path or alias. Returns true if something was removed.
export async function forgetFolder(stateDir: string, pathOrAlias: string): Promise<boolean> {
  const state = await loadFolders(stateDir);
  const real = existsSync(pathOrAlias) ? realOrSelf(pathOrAlias) : null;
  const before = state.folders.length;
  state.folders = state.folders.filter((f) => f.alias !== pathOrAlias && f.path !== real);
  if (state.folders.length === before) return false;
  await saveFolders(stateDir, state);
  return true;
}

export function isWithin(baseRealDir: string, candidateReal: string): boolean {
  if (candidateReal === baseRealDir) return true;
  return candidateReal.startsWith(baseRealDir + sep);
}

// --- pid file: marks that a server is (believed to be) running for a state dir ---

export interface PidInfo {
  pid: number;
  port: number;
  url: string;
}

export async function writePidFile(stateDir: string, info: PidInfo): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  await writeFile(pidFile(stateDir), JSON.stringify(info));
}

export async function readPidFile(stateDir: string): Promise<PidInfo | null> {
  try {
    const text = await readFile(pidFile(stateDir), "utf8");
    return JSON.parse(text) as PidInfo;
  } catch {
    return null;
  }
}

export async function clearPidFile(stateDir: string): Promise<void> {
  try {
    await rm(pidFile(stateDir));
  } catch {
    // already gone
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
