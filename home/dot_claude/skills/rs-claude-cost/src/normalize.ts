// Turns scanned transcript files into requests, threads, sessions, and events.
//
// A request is one assistant `message.id`. Claude Code writes one line per
// content block, so several lines can share a message.id with identical
// usage; those are counted once. A thread is the ordered requests in one
// file: the main session file is one thread, each subagent file is its own,
// linked to its parent session through its folder and `.meta.json`.

import { readFileSync } from "node:fs";
import type { ScannedFile } from "./scan.ts";
import { streamLines } from "./scan.ts";
import {
  emptyTokenCounts,
  type CompactionEvent,
  type ImageEvent,
  type SkillListingEvent,
  type Session,
  type Thread,
  type ThreadEvent,
  type ToolUse,
  type Turn,
} from "./types.ts";

const KNOWN_TOP_LEVEL_TYPES = new Set(["assistant", "user", "system", "attachment"]);

export interface NormalizeWindow {
  startMs: number;
  endMs: number;
}

export interface NormalizeDataQuality {
  filesRead: number;
  filesFailed: string[];
  duplicateLinesDropped: number;
  unknownRecordTypes: Record<string, number>;
  claudeCodeVersions: Set<string>;
  inferenceGeoValues: Record<string, number>;
}

export interface NormalizeResult {
  threads: Thread[];
  sessions: Session[];
  dataQuality: NormalizeDataQuality;
}

interface AssistantLineContentBlock {
  type: string;
  name?: string;
  input?: { file_path?: string; path?: string };
}

interface AssistantLine {
  type: "assistant";
  timestamp?: string;
  sessionId?: string;
  session_id?: string;
  cwd?: string;
  gitBranch?: string;
  effort?: string;
  perTurnEffort?: string;
  version?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      output_tokens?: number;
      speed?: "standard" | "fast";
      inference_geo?: string;
      cache_creation?: {
        ephemeral_1h_input_tokens?: number;
        ephemeral_5m_input_tokens?: number;
      };
      output_tokens_details?: {
        thinking_tokens?: number;
      };
    };
    content?: AssistantLineContentBlock[];
  };
}

function toMs(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : ms;
}

function inWindow(timestamp: string | undefined, window: NormalizeWindow): boolean {
  const ms = toMs(timestamp);
  if (ms === null) return false;
  return ms >= window.startMs && ms < window.endMs;
}

/**
 * Build one Turn from every line that shares a message.id. Lines are in
 * file order; the first line supplies the scalar fields, all lines
 * contribute tool_use blocks.
 */
function buildTurn(threadId: string, lines: AssistantLine[]): Turn | null {
  const first = lines[0];
  if (!first?.message?.id || !first.message.model) return null;
  const usage = first.message.usage;
  const timestamp = first.timestamp ?? "";
  const timestampMs = toMs(timestamp) ?? 0;

  const tokens = emptyTokenCounts();
  if (usage) {
    tokens.input = usage.input_tokens ?? 0;
    tokens.cache_read = usage.cache_read_input_tokens ?? 0;
    if (usage.cache_creation) {
      tokens.cache_write_5m = usage.cache_creation.ephemeral_5m_input_tokens ?? 0;
      tokens.cache_write_1h = usage.cache_creation.ephemeral_1h_input_tokens ?? 0;
    } else {
      tokens.cache_write_5m = usage.cache_creation_input_tokens ?? 0;
      tokens.cache_write_1h = 0;
    }
    tokens.output = usage.output_tokens ?? 0;
  }

  const toolUses: ToolUse[] = [];
  for (const line of lines) {
    for (const block of line.message?.content ?? []) {
      if (block.type === "tool_use" && block.name) {
        toolUses.push({
          name: block.name,
          filePath: block.input?.file_path ?? block.input?.path,
        });
      }
    }
  }

  return {
    messageId: first.message.id,
    threadId,
    timestamp,
    timestampMs,
    model: first.message.model,
    speed: usage?.speed === "fast" ? "fast" : "standard",
    effort: first.effort ?? first.perTurnEffort,
    cwd: first.cwd,
    gitBranch: first.gitBranch,
    tokens,
    promptSize: tokens.input + tokens.cache_read + tokens.cache_write_5m + tokens.cache_write_1h,
    compactedSincePrevious: false,
    toolUses,
    images: [],
    thinkingTokens: usage?.output_tokens_details?.thinking_tokens ?? 0,
  };
}

async function processFile(
  file: ScannedFile,
  window: NormalizeWindow,
  dq: NormalizeDataQuality,
): Promise<Thread> {
  const threadId = file.kind === "main" ? file.sessionId : `agent-${file.agentId}`;
  const thread: Thread = {
    id: threadId,
    kind: file.kind,
    sessionId: file.sessionId,
    parentSessionId: file.kind === "subagent" ? file.sessionId : undefined,
    turns: [],
    events: [],
    images: [],
  };

  if (file.kind === "subagent" && file.metaPath) {
    try {
      const meta = JSON.parse(readFileSync(file.metaPath, "utf8"));
      thread.agentType = meta.agentType;
      thread.pinnedModel = meta.model;
    } catch {
      // Missing or unreadable meta.json is not fatal; agentType stays unknown.
    }
  }

  const groups = new Map<string, AssistantLine[]>();
  const groupOrder: string[] = [];

  let readError: unknown = null;
  try {
    for await (const { raw } of streamLines(file.path)) {
      const rec = raw as { type?: string; timestamp?: string; version?: string };
      if (typeof rec !== "object" || rec === null) continue;
      if (!inWindow(rec.timestamp, window)) continue;
      if (rec.version) dq.claudeCodeVersions.add(rec.version);

      if (rec.type === "assistant") {
        const line = rec as AssistantLine;
        const model = line.message?.model;
        if (!model || model === "<synthetic>") continue;
        const id = line.message?.id;
        if (!id) continue;
        const geo = line.message?.usage?.inference_geo;
        if (geo) dq.inferenceGeoValues[geo] = (dq.inferenceGeoValues[geo] ?? 0) + 1;
        if (!groups.has(id)) {
          groups.set(id, []);
          groupOrder.push(id);
        }
        groups.get(id)!.push(line);
        continue;
      }

      if (rec.type === "system") {
        const sys = rec as {
          subtype?: string;
          compactMetadata?: { trigger?: string; preTokens?: number; postTokens?: number };
        };
        if (sys.subtype === "compact_boundary") {
          const event: CompactionEvent = {
            type: "compaction",
            threadId,
            timestamp: rec.timestamp ?? "",
            timestampMs: toMs(rec.timestamp) ?? 0,
            trigger: sys.compactMetadata?.trigger ?? "unknown",
            preTokens: sys.compactMetadata?.preTokens,
            postTokens: sys.compactMetadata?.postTokens,
          };
          thread.events.push(event);
        }
        continue;
      }

      if (rec.type === "attachment") {
        const att = rec as {
          attachment?: { type?: string; skillCount?: number; content?: string };
        };
        if (att.attachment?.type === "skill_listing") {
          const content = att.attachment.content ?? "";
          const event: SkillListingEvent = {
            type: "skill_listing",
            threadId,
            timestamp: rec.timestamp ?? "",
            timestampMs: toMs(rec.timestamp) ?? 0,
            skillCount: att.attachment.skillCount ?? 0,
            bytes: Buffer.byteLength(content, "utf8"),
          };
          thread.events.push(event);
        }
        continue;
      }

      if (rec.type === "user") {
        const user = rec as {
          toolUseResult?: {
            type?: string;
            file?: {
              originalSize?: number;
              dimensions?: { displayWidth?: number; displayHeight?: number };
            };
          };
          message?: { content?: Array<{ type?: string; tool_use_id?: string }> };
        };
        if (user.toolUseResult?.type === "image") {
          const toolUseId = user.message?.content?.find(
            (b) => b.type === "tool_result",
          )?.tool_use_id;
          const image: ImageEvent & { timestamp: string; timestampMs: number } = {
            toolUseId,
            bytes: user.toolUseResult.file?.originalSize,
            displayWidth: user.toolUseResult.file?.dimensions?.displayWidth,
            displayHeight: user.toolUseResult.file?.dimensions?.displayHeight,
            timestamp: rec.timestamp ?? "",
            timestampMs: toMs(rec.timestamp) ?? 0,
          };
          thread.images.push(image);
        }
        continue;
      }

      if (!KNOWN_TOP_LEVEL_TYPES.has(rec.type ?? "")) {
        const key = rec.type ?? "(missing)";
        dq.unknownRecordTypes[key] = (dq.unknownRecordTypes[key] ?? 0) + 1;
      }
    }
  } catch (err) {
    readError = err;
  }

  if (readError) {
    dq.filesFailed.push(file.path);
    return thread;
  }

  for (const id of groupOrder) {
    const lines = groups.get(id)!;
    if (lines.length > 1) dq.duplicateLinesDropped += lines.length - 1;
    const turn = buildTurn(threadId, lines);
    if (turn) thread.turns.push(turn);
  }

  thread.turns.sort((a, b) => a.timestampMs - b.timestampMs);
  thread.events.sort((a, b) => a.timestampMs - b.timestampMs);

  const compactionTimes = thread.events
    .filter((e): e is CompactionEvent => e.type === "compaction")
    .map((e) => e.timestampMs);
  let prevTimestampMs = -Infinity;
  for (const turn of thread.turns) {
    turn.compactedSincePrevious = compactionTimes.some(
      (t) => t > prevTimestampMs && t <= turn.timestampMs,
    );
    prevTimestampMs = turn.timestampMs;
  }

  dq.filesRead += 1;
  return thread;
}

function buildSession(mainThread: Thread, subagentThreads: Thread[]): Session {
  const turns = mainThread.turns;
  const firstTimestampMs = turns[0]?.timestampMs ?? 0;
  const lastTimestampMs = turns[turns.length - 1]?.timestampMs ?? firstTimestampMs;
  const spanHours = (lastTimestampMs - firstTimestampMs) / (1000 * 60 * 60);

  const daysTouched = new Set(
    turns.map((t) => new Date(t.timestampMs).toISOString().slice(0, 10)),
  ).size;

  const lastCwd = [...turns].reverse().find((t) => t.cwd)?.cwd;
  const lastBranch = [...turns].reverse().find((t) => t.gitBranch)?.gitBranch;
  const project = lastCwd ? lastCwd.split("/").pop() ?? lastCwd : "unknown";

  return {
    id: mainThread.id,
    project,
    branch: lastBranch,
    firstTimestampMs,
    lastTimestampMs,
    spanHours,
    daysTouched,
    turns: turns.length,
    peakContext: turns.reduce((max, t) => Math.max(max, t.promptSize), 0),
    compactions: mainThread.events.filter((e) => e.type === "compaction").length,
    mainThreadId: mainThread.id,
    subagentThreadIds: subagentThreads.map((t) => t.id),
    resumeCommand: `claude --resume ${mainThread.id}`,
    contextSeries: turns.map((t) => ({
      promptSize: t.promptSize,
      compactedSincePrevious: t.compactedSincePrevious,
    })),
    cacheBreaks: [],
  };
}

export async function normalize(
  files: ScannedFile[],
  window: NormalizeWindow,
): Promise<NormalizeResult> {
  const dq: NormalizeDataQuality = {
    filesRead: 0,
    filesFailed: [],
    duplicateLinesDropped: 0,
    unknownRecordTypes: {},
    claudeCodeVersions: new Set(),
    inferenceGeoValues: {},
  };

  const threads: Thread[] = [];
  for (const file of files) {
    threads.push(await processFile(file, window, dq));
  }

  const mainThreads = threads.filter((t) => t.kind === "main");
  const subagentsByParent = new Map<string, Thread[]>();
  for (const thread of threads) {
    if (thread.kind !== "subagent") continue;
    const list = subagentsByParent.get(thread.sessionId) ?? [];
    list.push(thread);
    subagentsByParent.set(thread.sessionId, list);
  }

  const sessions = mainThreads.map((main) =>
    buildSession(main, subagentsByParent.get(main.id) ?? []),
  );

  return { threads, sessions, dataQuality: dq };
}
