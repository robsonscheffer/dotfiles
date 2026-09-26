// Resolves a request path against a remembered folder, refusing traversal and
// symlink escapes. Only a remembered folder's own realpath is ever served.
import { realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { isWithin } from "./state.ts";

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
