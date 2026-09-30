// cmux plumbing for interactive compare: open a workspace with three panes, send text to them,
// and read each pane's answers back out of its Claude Code transcript.
import { homedir } from "node:os";
import type { Env } from "../types.ts";
import { findTranscript } from "./transcript.ts";

export function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export interface PaneRecord {
  name: string;
  session_id: string;
  workspace: string;
  surface: string;
  argv: string[];
}

function ref(output: string, kind: "workspace" | "surface"): string | null {
  return output.match(new RegExp(`${kind}:\\d+`))?.[0] ?? null;
}

async function cmux(env: Env, args: string[]): Promise<string> {
  const cmd = ["cmux", ...args];
  const result = await env.run(cmd).catch((error: unknown) => ({ code: 1, stdout: "", stderr: String(error) }));
  if (result.code !== 0) {
    const text = result.stderr.trim().length > 0 ? result.stderr : result.stdout;
    throw new Error(`${cmd.join(" ")} failed: ${text.slice(0, 500)}`);
  }
  return result.stdout;
}

export interface PaneLaunch {
  name: string;
  argv: string[];
  sessionId: string;
}

// Creates the workspace with the first pane, then splits right twice. Returns one record per
// launch, in order. Pane commands are the launch argv plus `--session-id` and the prompt.
export async function openPanes(
  env: Env,
  opts: { title: string; cwd: string; prompt: string; launches: PaneLaunch[] },
): Promise<PaneRecord[]> {
  const commandFor = (l: PaneLaunch) =>
    [...l.argv, "--session-id", l.sessionId, opts.prompt].map(shellQuote).join(" ");
  const [first, ...rest] = opts.launches;
  if (!first) return [];

  const created = await cmux(env, ["new-workspace", "--name", opts.title, "--cwd", opts.cwd, "--command", commandFor(first)]);
  const workspace = ref(created, "workspace");
  if (!workspace) throw new Error(`cmux new-workspace printed no workspace ref: ${created.slice(0, 200)}`);
  const listed = await cmux(env, ["list-pane-surfaces", "--workspace", workspace]);
  let surface = ref(listed, "surface");
  if (!surface) throw new Error(`cmux list-pane-surfaces printed no surface ref: ${listed.slice(0, 200)}`);

  const records: PaneRecord[] = [{ name: first.name, session_id: first.sessionId, workspace, surface, argv: first.argv }];
  for (const launch of rest) {
    const split = await cmux(env, ["new-split", "right", "--workspace", workspace, "--surface", surface]);
    const next = ref(split, "surface");
    if (!next) throw new Error(`cmux new-split printed no surface ref: ${split.slice(0, 200)}`);
    surface = next;
    await cmux(env, ["send", "--workspace", workspace, "--surface", surface, `${commandFor(launch)}\\n`]);
    records.push({ name: launch.name, session_id: launch.sessionId, workspace, surface, argv: launch.argv });
  }
  return records;
}

export async function sendText(env: Env, panes: PaneRecord[], text: string): Promise<void> {
  for (const pane of panes) {
    await cmux(env, ["send", "--workspace", pane.workspace, "--surface", pane.surface, `${text}\\n`]);
  }
}

function textOf(content: unknown): string | null {
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

// One entry per turn, matching parseTranscript's turn boundaries: the text of the last assistant
// message that has any. A turn with no assistant text gives an empty string.
export function parseAnswers(transcript: string): string[] {
  const answers: string[] = [];
  let open = false;
  for (const raw of transcript.split("\n")) {
    if (!raw.trim()) continue;
    let line: { type?: string; message?: { content?: unknown } };
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!line || typeof line !== "object") continue;
    if (line.type === "user" && textOf(line.message?.content) !== null) {
      answers.push("");
      open = true;
    } else if (open && line.type === "assistant") {
      const text = textOf(line.message?.content);
      if (text !== null) answers[answers.length - 1] = text;
    }
  }
  return answers;
}

export async function readAnswers(sessionId: string, home: string = homedir()): Promise<string[] | null> {
  const path = await findTranscript(sessionId, home);
  if (!path) return null;
  return parseAnswers(await Bun.file(path).text());
}
