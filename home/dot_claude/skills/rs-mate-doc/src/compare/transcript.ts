import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TurnMetrics } from "./types.ts";

interface Usage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
}

interface Line {
  type?: string;
  timestamp?: string;
  requestId?: string;
  message?: { content?: unknown; usage?: Usage };
}

export async function findTranscript(sessionId: string, home: string = homedir()): Promise<string | null> {
  const root = join(home, ".claude", "projects");
  let dirs: string[];
  try {
    dirs = await readdir(root);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const path = join(root, dir, `${sessionId}.jsonl`);
    if (await Bun.file(path).exists()) return path;
  }
  return null;
}

function promptText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      texts.push(String((block as { text?: unknown }).text ?? ""));
    }
  }
  return texts.length > 0 ? texts.join("\n") : null;
}

function millis(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? null : value;
}

interface Draft {
  prompt: string;
  start: number | null;
  last: number | null;
  requests: Map<string, Usage>;
}

export function parseTranscript(text: string): TurnMetrics[] {
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let anonymous = 0;

  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    let line: Line;
    try {
      line = JSON.parse(raw) as Line;
    } catch {
      continue;
    }
    if (!line || typeof line !== "object") continue;
    const at = millis(line.timestamp);

    if (line.type === "user") {
      const prompt = promptText(line.message?.content);
      if (prompt !== null) {
        current = { prompt, start: at, last: at, requests: new Map() };
        drafts.push(current);
        continue;
      }
    }
    if (!current) continue;
    if (at !== null) current.last = at;
    if (line.type === "assistant" && line.message?.usage) {
      const key = line.requestId ?? `anon-${anonymous++}`;
      current.requests.delete(key);
      current.requests.set(key, line.message.usage);
    }
  }

  return drafts.map((draft, index) => {
    const usages = [...draft.requests.values()];
    const final = usages[usages.length - 1];
    const context = final
      ? (final.input_tokens ?? 0) + (final.cache_read_input_tokens ?? 0) + (final.cache_creation_input_tokens ?? 0)
      : 0;
    const output = usages.reduce((sum, usage) => sum + (usage.output_tokens ?? 0), 0);
    const elapsed = draft.start !== null && draft.last !== null ? (draft.last - draft.start) / 1000 : 0;
    return {
      turn: index + 1,
      prompt: draft.prompt.slice(0, 200),
      seconds: Math.round(elapsed * 10) / 10,
      context,
      output,
    };
  });
}

export async function readTurnMetrics(sessionId: string, home?: string): Promise<TurnMetrics[] | null> {
  const path = await findTranscript(sessionId, home);
  if (!path) return null;
  return parseTranscript(await Bun.file(path).text());
}
