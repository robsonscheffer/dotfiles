import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeTmpRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

/** Writes `lines` (objects, one per jsonl line) to `path`, creating parent dirs. */
export function writeJsonl(path: string, lines: unknown[]): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

export function assistantLine(opts: {
  messageId: string;
  timestamp: string;
  model: string;
  usage?: Record<string, unknown>;
  content?: Array<Record<string, unknown>>;
  cwd?: string;
  gitBranch?: string;
  version?: string;
}) {
  return {
    type: "assistant",
    timestamp: opts.timestamp,
    cwd: opts.cwd,
    gitBranch: opts.gitBranch,
    version: opts.version,
    message: {
      id: opts.messageId,
      model: opts.model,
      usage: opts.usage ?? {
        input_tokens: 100,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 50,
      },
      content: opts.content ?? [{ type: "text", text: "hi" }],
    },
  };
}
