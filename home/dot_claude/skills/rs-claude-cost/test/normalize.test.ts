import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { findCandidateFiles } from "../src/scan.ts";
import { normalize } from "../src/normalize.ts";
import { assistantLine, makeTmpRoot, writeJsonl } from "./helpers.ts";

const WEEK_START = Date.parse("2026-09-21T00:00:00.000Z");
const WEEK_END = Date.parse("2026-09-28T00:00:00.000Z");

describe("normalize", () => {
  test("one request spanning four content-block lines counts once", async () => {
    const root = makeTmpRoot("rs-cost-dedupe");
    const sessionPath = join(root, "proj1", "session-a.jsonl");
    writeJsonl(sessionPath, [
      assistantLine({
        messageId: "msg-1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        content: [{ type: "text", text: "thinking" }],
      }),
      assistantLine({
        messageId: "msg-1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        content: [{ type: "tool_use", name: "Read", input: { file_path: "/a.ts" } }],
      }),
      assistantLine({
        messageId: "msg-1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        content: [{ type: "tool_use", name: "Edit", input: { file_path: "/a.ts" } }],
      }),
      assistantLine({
        messageId: "msg-1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
        content: [{ type: "text", text: "done" }],
      }),
    ]);

    const files = findCandidateFiles(root, WEEK_START);
    const { threads, dataQuality } = await normalize(files, {
      startMs: WEEK_START,
      endMs: WEEK_END,
    });

    expect(threads).toHaveLength(1);
    expect(threads[0]!.turns).toHaveLength(1);
    expect(threads[0]!.turns[0]!.toolUses.map((t) => t.name)).toEqual(["Read", "Edit"]);
    expect(dataQuality.duplicateLinesDropped).toBe(3);
  });

  test("a subagent's cost lands under its parent session", async () => {
    const root = makeTmpRoot("rs-cost-subagent");
    const mainPath = join(root, "proj1", "session-b.jsonl");
    writeJsonl(mainPath, [
      assistantLine({
        messageId: "main-1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
      }),
    ]);
    const subPath = join(root, "proj1", "session-b", "subagents", "agent-x1.jsonl");
    writeJsonl(subPath, [
      assistantLine({
        messageId: "sub-1",
        timestamp: "2026-09-22T10:01:00.000Z",
        model: "claude-haiku-4-5",
      }),
    ]);
    writeJsonl(join(root, "proj1", "session-b", "subagents", "agent-x1.meta.json"), []);
    Bun.write(
      join(root, "proj1", "session-b", "subagents", "agent-x1.meta.json"),
      JSON.stringify({ agentType: "general-purpose", model: "haiku" }),
    );

    const files = findCandidateFiles(root, WEEK_START);
    const { threads, sessions } = await normalize(files, {
      startMs: WEEK_START,
      endMs: WEEK_END,
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe("session-b");
    expect(sessions[0]!.subagentThreadIds).toEqual(["agent-x1"]);
    const subThread = threads.find((t) => t.kind === "subagent")!;
    expect(subThread.sessionId).toBe("session-b");
    expect(subThread.agentType).toBe("general-purpose");
  });

  test("a line one second outside the window is excluded", async () => {
    const root = makeTmpRoot("rs-cost-window");
    const sessionPath = join(root, "proj1", "session-c.jsonl");
    writeJsonl(sessionPath, [
      assistantLine({
        messageId: "in-window",
        timestamp: "2026-09-21T00:00:00.000Z",
        model: "claude-sonnet-5",
      }),
      assistantLine({
        messageId: "before-window",
        timestamp: "2026-09-20T23:59:59.000Z",
        model: "claude-sonnet-5",
      }),
      assistantLine({
        messageId: "at-end-excluded",
        timestamp: "2026-09-28T00:00:00.000Z",
        model: "claude-sonnet-5",
      }),
    ]);

    const files = findCandidateFiles(root, WEEK_START);
    const { threads } = await normalize(files, { startMs: WEEK_START, endMs: WEEK_END });

    expect(threads[0]!.turns).toHaveLength(1);
    expect(threads[0]!.turns[0]!.messageId).toBe("in-window");
  });

  test("usage comes from the line with the final output count, not a partial streaming one", async () => {
    const root = makeTmpRoot("rs-cost-streaming-usage");
    const usage = (output: number) => ({ input_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 0, output_tokens: output });
    writeJsonl(join(root, "proj", "sess-s.jsonl"), [
      assistantLine({ messageId: "m", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5", usage: usage(7) }),
      assistantLine({ messageId: "m", timestamp: "2026-09-22T10:00:01.000Z", model: "claude-sonnet-5", usage: usage(2151) }),
    ]);

    const files = findCandidateFiles(root, WEEK_START);
    const { threads } = await normalize(files, { startMs: WEEK_START, endMs: WEEK_END });

    expect(threads[0]!.turns).toHaveLength(1);
    expect(threads[0]!.turns[0]!.tokens.output).toBe(2151);
  });

  test("a session with no turns inside the window is not counted", async () => {
    const root = makeTmpRoot("rs-cost-empty-session");
    writeJsonl(join(root, "proj1", "session-in.jsonl"), [
      assistantLine({ messageId: "in", timestamp: "2026-09-22T10:00:00.000Z", model: "claude-sonnet-5" }),
    ]);
    writeJsonl(join(root, "proj1", "session-after.jsonl"), [
      assistantLine({ messageId: "after", timestamp: "2026-09-29T10:00:00.000Z", model: "claude-sonnet-5" }),
    ]);

    const files = findCandidateFiles(root, WEEK_START);
    const { sessions } = await normalize(files, { startMs: WEEK_START, endMs: WEEK_END });

    expect(sessions.map((s) => s.id)).toEqual(["session-in"]);
  });

  test("a compaction boundary is found and flags the next turn", async () => {
    const root = makeTmpRoot("rs-cost-compaction");
    const sessionPath = join(root, "proj1", "session-d.jsonl");
    writeJsonl(sessionPath, [
      assistantLine({
        messageId: "before",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "claude-sonnet-5",
      }),
      {
        type: "system",
        subtype: "compact_boundary",
        timestamp: "2026-09-22T10:05:00.000Z",
        compactMetadata: { trigger: "auto", preTokens: 338_575, postTokens: 13_319 },
      },
      assistantLine({
        messageId: "after",
        timestamp: "2026-09-22T10:06:00.000Z",
        model: "claude-sonnet-5",
      }),
    ]);

    const files = findCandidateFiles(root, WEEK_START);
    const { threads } = await normalize(files, { startMs: WEEK_START, endMs: WEEK_END });

    const thread = threads[0]!;
    expect(thread.events.filter((e) => e.type === "compaction")).toHaveLength(1);
    expect(thread.turns[0]!.compactedSincePrevious).toBe(false);
    expect(thread.turns[1]!.compactedSincePrevious).toBe(true);
  });

  test("counts unknown record types without failing", async () => {
    const root = makeTmpRoot("rs-cost-unknown-types");
    const sessionPath = join(root, "proj1", "session-e.jsonl");
    writeJsonl(sessionPath, [
      { type: "atis-latch", timestamp: "2026-09-22T10:00:00.000Z" },
      assistantLine({
        messageId: "m1",
        timestamp: "2026-09-22T10:00:01.000Z",
        model: "claude-sonnet-5",
      }),
    ]);

    const files = findCandidateFiles(root, WEEK_START);
    const { threads, dataQuality } = await normalize(files, {
      startMs: WEEK_START,
      endMs: WEEK_END,
    });

    expect(threads[0]!.turns).toHaveLength(1);
    expect(dataQuality.unknownRecordTypes["atis-latch"]).toBe(1);
  });

  test("<synthetic> model lines are ignored", async () => {
    const root = makeTmpRoot("rs-cost-synthetic");
    const sessionPath = join(root, "proj1", "session-f.jsonl");
    writeJsonl(sessionPath, [
      assistantLine({
        messageId: "synth-1",
        timestamp: "2026-09-22T10:00:00.000Z",
        model: "<synthetic>",
      }),
      assistantLine({
        messageId: "real-1",
        timestamp: "2026-09-22T10:00:01.000Z",
        model: "claude-sonnet-5",
      }),
    ]);

    const files = findCandidateFiles(root, WEEK_START);
    const { threads } = await normalize(files, { startMs: WEEK_START, endMs: WEEK_END });

    expect(threads[0]!.turns).toHaveLength(1);
    expect(threads[0]!.turns[0]!.messageId).toBe("real-1");
  });
});
