// Resolves a request path against a remembered folder, refusing traversal and
// symlink escapes. Only a remembered folder's own realpath is ever served.
import { realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize, relative, sep } from "node:path";
import { isWithin, type RememberedFolder } from "./state.ts";

export type Resolved =
  | { kind: "dir"; abs: string }
  | { kind: "file"; abs: string }
  | { kind: "notfound" };

function realOrNull(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

// baseRealDir must already be a realpath (as stored in the folder registry).
export async function resolveSafePath(baseRealDir: string, restPath: string): Promise<Resolved> {
  const decoded = restPath
    .split("/")
    .map((seg) => decodeURIComponent(seg))
    .join("/");
  const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.split(sep).includes("..")) return { kind: "notfound" };

  const candidate = normalize(join(baseRealDir, normalized));
  if (!isWithin(baseRealDir, candidate)) return { kind: "notfound" };

  const tryPaths = [candidate, `${candidate}.md`];
  for (const p of tryPaths) {
    const real = realOrNull(p);
    if (!real) continue;
    if (!isWithin(baseRealDir, real)) return { kind: "notfound" };
    try {
      const st = await stat(real);
      if (st.isDirectory()) return { kind: "dir", abs: real };
      if (st.isFile()) return { kind: "file", abs: real };
    } catch {
      continue;
    }
  }
  return { kind: "notfound" };
}

// legacy: remove after pages migrate. Old `/md?path=<absolute>` links pointed at a file by
// its real filesystem path; this finds which remembered folder (if any) now covers it.
export function findFolderForAbsolutePath(
  folders: RememberedFolder[],
  absPath: string,
): { folder: RememberedFolder; relPath: string } | null {
  const real = realOrNull(absPath);
  if (!real) return null;
  for (const folder of folders) {
    if (isWithin(folder.path, real)) {
      return { folder, relPath: relative(folder.path, real).split(sep).join("/") };
    }
  }
  return null;
}
