// Finds transcript files under a root, and streams their lines as parsed JSON.
// File modification time only narrows the search; a line's own timestamp decides
// whether it falls inside the report window.

import { readdirSync, statSync } from "node:fs";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

export interface ScannedFile {
  path: string;
  kind: "main" | "subagent";
  /** the session this file belongs to: itself for main, the parent for subagent */
  sessionId: string;
  /** subagent id, present only when kind === "subagent" */
  agentId?: string;
  /** sibling .meta.json path, present only when kind === "subagent" */
  metaPath?: string;
  mtimeMs: number;
}

/**
 * Walk `root` recursively and return every `.jsonl` transcript whose mtime is
 * on or after `sinceMs`. Skips read errors on individual directories rather
 * than failing the whole scan.
 */
export function findCandidateFiles(root: string, sinceMs: number): ScannedFile[] {
  const results: ScannedFile[] = [];

  function walk(dir: string) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      if (entry.name.endsWith(".meta.json")) continue;

      let mtimeMs: number;
      try {
        mtimeMs = statSync(full).mtimeMs;
      } catch {
        continue;
      }
      if (mtimeMs < sinceMs) continue;

      const parentDir = dir.split("/").pop() ?? "";
      if (parentDir === "subagents") {
        const agentMatch = entry.name.match(/^agent-(.+)\.jsonl$/);
        const agentId = agentMatch ? agentMatch[1] : entry.name.replace(/\.jsonl$/, "");
        const sessionDir = dir.split("/").slice(0, -1).pop() ?? "";
        results.push({
          path: full,
          kind: "subagent",
          sessionId: sessionDir,
          agentId,
          metaPath: full.replace(/\.jsonl$/, ".meta.json"),
          mtimeMs,
        });
      } else {
        results.push({
          path: full,
          kind: "main",
          sessionId: entry.name.replace(/\.jsonl$/, ""),
          mtimeMs,
        });
      }
    }
  }

  walk(root);
  return results;
}

export interface RawLine {
  lineNumber: number;
  raw: unknown;
}

/**
 * Stream a .jsonl file line by line, yielding parsed JSON. Blank lines are
 * skipped. Malformed JSON is skipped and reported via `onParseError`.
 */
export async function* streamLines(
  path: string,
  onParseError?: (lineNumber: number, err: unknown) => void,
): AsyncGenerator<RawLine> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      yield { lineNumber, raw: JSON.parse(trimmed) };
    } catch (err) {
      onParseError?.(lineNumber, err);
    }
  }
}
