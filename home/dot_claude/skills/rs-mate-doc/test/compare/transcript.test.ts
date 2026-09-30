import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findTranscript, parseTranscript, readTurnMetrics } from "../../src/compare/transcript.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-transcript-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const usage = (input: number, create: number, read: number, output: number) => ({
  input_tokens: input,
  cache_creation_input_tokens: create,
  cache_read_input_tokens: read,
  output_tokens: output,
});

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

function fixture(): string {
  const req1 = usage(2, 100, 50, 10);
  const req2 = usage(3, 20, 200, 30);
  const req3 = usage(1, 0, 400, 7);
  return [
    line({ type: "summary", summary: "ignored" }),
    line({ type: "user", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "Explain the refund policy." } }),
    line({ type: "assistant", timestamp: "2026-01-01T00:00:02.000Z", requestId: "req_1", message: { model: "m", usage: req1 } }),
    line({ type: "assistant", timestamp: "2026-01-01T00:00:02.500Z", requestId: "req_1", message: { model: "m", usage: req1 } }),
    line({ type: "assistant", timestamp: "2026-01-01T00:00:03.000Z", requestId: "req_1", message: { model: "m", usage: req1 } }),
    "{not valid json",
    line({ type: "user", timestamp: "2026-01-01T00:00:04.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } }),
    line({ type: "assistant", timestamp: "2026-01-01T00:00:05.200Z", requestId: "req_2", message: { model: "m", usage: req2 } }),
    line({ type: "user", timestamp: "2026-01-01T00:01:00.000Z", message: { role: "user", content: [{ type: "text", text: "Summarize the shipping terms." }] } }),
    line({ type: "assistant", timestamp: "2026-01-01T00:01:03.000Z", requestId: "req_3", message: { model: "m", usage: req3 } }),
  ].join("\n");
}

describe("parseTranscript", () => {
  test("splits turns at real prompts only", () => {
    const turns = parseTranscript(fixture());
    expect(turns.map((t) => t.turn)).toEqual([1, 2]);
    expect(turns[0]!.prompt).toBe("Explain the refund policy.");
    expect(turns[1]!.prompt).toBe("Summarize the shipping terms.");
  });

  test("dedupes repeated requestId and sums output", () => {
    const turns = parseTranscript(fixture());
    expect(turns[0]!.output).toBe(10 + 30);
    expect(turns[1]!.output).toBe(7);
  });

  test("context comes from the last request", () => {
    const turns = parseTranscript(fixture());
    expect(turns[0]!.context).toBe(3 + 20 + 200);
    expect(turns[1]!.context).toBe(401);
  });

  test("seconds is last timestamp minus prompt timestamp", () => {
    const turns = parseTranscript(fixture());
    expect(turns[0]!.seconds).toBe(5.2);
    expect(turns[1]!.seconds).toBe(3);
  });

  test("truncates long prompts to 200 chars", () => {
    const long = "x".repeat(500);
    const text = line({ type: "user", timestamp: "2026-01-01T00:00:00Z", message: { content: long } });
    expect(parseTranscript(text)[0]!.prompt).toHaveLength(200);
  });

  test("empty and garbage input give no turns", () => {
    expect(parseTranscript("")).toEqual([]);
    expect(parseTranscript("nope\n{}\n")).toEqual([]);
  });
});

describe("findTranscript and readTurnMetrics", () => {
  test("finds the file under any project dir", async () => {
    const home = await tempDir();
    const dir = join(home, ".claude", "projects", "-some-encoded-cwd");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "sess-1.jsonl"), fixture());
    expect(await findTranscript("sess-1", home)).toBe(join(dir, "sess-1.jsonl"));
    const turns = await readTurnMetrics("sess-1", home);
    expect(turns).toHaveLength(2);
  });

  test("missing file gives null", async () => {
    const home = await tempDir();
    expect(await findTranscript("absent", home)).toBeNull();
    expect(await readTurnMetrics("absent", home)).toBeNull();
    await mkdir(join(home, ".claude", "projects", "p"), { recursive: true });
    expect(await readTurnMetrics("absent", home)).toBeNull();
  });
});
