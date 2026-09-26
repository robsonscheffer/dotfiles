// Published-copy state: ${XDG_STATE_HOME:-~/.local/state}/mate-doc/published.json (override with
// MATE_DOC_STATE_DIR), keyed by absolute doc path, then target name.
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface PublishedEntry {
  slug: string;
  owner_key: string;
  url: string;
  published_at: string; // ISO
  ledger_hash: string;
}

export type PublishedState = Record<string, Record<string, PublishedEntry>>;

export interface StateEnvLike {
  [key: string]: string | undefined;
}

export function defaultStateDir(env: StateEnvLike): string {
  if (env.MATE_DOC_STATE_DIR) return env.MATE_DOC_STATE_DIR;
  const xdgState = env.XDG_STATE_HOME || join(env.HOME || "", ".local", "state");
  return join(xdgState, "mate-doc");
}

function statePath(stateDir: string): string {
  return join(stateDir, "published.json");
}

// Realpath when possible (docs may be reached through a symlinked temp dir), falling back to a
// plain absolute path when the path does not exist yet.
export function canonicalDocPath(docPath: string): string {
  try {
    return realpathSync(docPath);
  } catch {
    return resolve(docPath);
  }
}

export async function loadPublishedState(stateDir: string): Promise<PublishedState> {
  try {
    const text = await readFile(statePath(stateDir), "utf8");
    const parsed = JSON.parse(text) as PublishedState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function savePublishedState(stateDir: string, state: PublishedState): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  await writeFile(statePath(stateDir), JSON.stringify(state, null, 2));
}

export async function recordPublish(
  stateDir: string,
  docPath: string,
  target: string,
  entry: PublishedEntry,
): Promise<void> {
  const key = canonicalDocPath(docPath);
  const state = await loadPublishedState(stateDir);
  state[key] = { ...(state[key] ?? {}), [target]: entry };
  await savePublishedState(stateDir, state);
}

export async function existingPublishedEntry(
  stateDir: string,
  docPath: string,
  target: string,
): Promise<PublishedEntry | null> {
  const key = canonicalDocPath(docPath);
  const state = await loadPublishedState(stateDir);
  return state[key]?.[target] ?? null;
}

// Published copies of a doc, across every target it has ever been sent to. Used by `status` to
// report stale copies; never printed with the full owner_key.
export async function publishedCopies(
  docPath: string,
  stateDir: string,
): Promise<Record<string, PublishedEntry>> {
  const key = canonicalDocPath(docPath);
  const state = await loadPublishedState(stateDir);
  return state[key] ?? {};
}

export function maskOwnerKey(ownerKey: string): string {
  return `...${ownerKey.slice(-4)}`;
}
