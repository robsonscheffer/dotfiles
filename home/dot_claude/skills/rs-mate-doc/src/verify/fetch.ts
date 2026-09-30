// Fetches the evidence a claim points at, so the verifier reads what mate-doc fetched itself
// and never what the author pasted into the ledger. Uses env.run and env.fetch only.
import { join } from "node:path";
import { resolveRepoPath } from "../audit/adapters.ts";
import type { Env, Evidence } from "../types.ts";
import { CODE_WINDOW_RADIUS, MAX_WINDOW_CHARS } from "./constants.ts";

export type FetchResult =
  | {
      ok: true;
      // What the agent reads. For code, every line is prefixed "<n>: ".
      window: string;
      // The same text without line prefixes, for exact-substring checks.
      raw: string;
      // Parsed rows (query) or record (record), for the mechanical expect check.
      rows?: Array<Record<string, unknown>>;
      record?: unknown;
      // The prompt's ref: the code ref, the link URL, the SQL text, or "<ref> <field>".
      ref: string;
    }
  | { ok: false; reason: string };

function cap(text: string): string {
  return text.length <= MAX_WINDOW_CHARS ? text : text.slice(0, MAX_WINDOW_CHARS);
}

// Cap to MAX_WINDOW_CHARS around the excerpt when it is found, else keep the start.
function capAround(text: string, excerpt: string | undefined): string {
  if (text.length <= MAX_WINDOW_CHARS) return text;
  const at = excerpt ? text.indexOf(excerpt) : -1;
  if (at === -1) return text.slice(0, MAX_WINDOW_CHARS);
  const start = Math.max(0, Math.min(text.length - MAX_WINDOW_CHARS, at + Math.floor(excerpt!.length / 2) - Math.floor(MAX_WINDOW_CHARS / 2)));
  return text.slice(start, start + MAX_WINDOW_CHARS);
}

function plain(text: string, ref: string, extra: Partial<Extract<FetchResult, { ok: true }>> = {}): FetchResult {
  return { ok: true, window: text, raw: text, ref, ...extra };
}

async function fetchCode(ev: Extract<Evidence, { kind: "code" }>, env: Env): Promise<FetchResult> {
  const match = /^([^@]+)@([^:]+):([^:]+):([0-9]+)$/.exec(ev.ref);
  if (!match) return { ok: false, reason: `malformed ref: ${ev.ref}` };
  const [, repo, rev, path, lineStr] = match as unknown as [string, string, string, string, string];
  const line = Number(lineStr);

  let content: string;
  const localRepoPath = await resolveRepoPath(repo);
  if (localRepoPath) {
    const result = await env.run(["git", "-C", localRepoPath, "show", `${rev}:${path}`]);
    if (result.code !== 0) return { ok: false, reason: result.stderr.trim() || "git show failed" };
    content = result.stdout;
  } else if (ev.needs === "gh" || env.has("gh")) {
    const result = await env.run(["gh", "api", `repos/${repo}/contents/${path}?ref=${rev}`]);
    if (result.code !== 0) return { ok: false, reason: result.stderr.trim() || "gh api failed" };
    const parsed = JSON.parse(result.stdout) as { content?: string; encoding?: string };
    content = parsed.content
      ? Buffer.from(parsed.content, (parsed.encoding as BufferEncoding) ?? "base64").toString("utf8")
      : "";
  } else {
    return { ok: false, reason: `repo ${repo} not available here` };
  }

  const lines = content.split("\n");
  const start = Math.max(1, line - CODE_WINDOW_RADIUS);
  const end = Math.min(lines.length, line + CODE_WINDOW_RADIUS);
  const picked = lines.slice(start - 1, end);
  return {
    ok: true,
    window: picked.map((l, i) => `${start + i}: ${l}`).join("\n"),
    raw: picked.join("\n"),
    ref: ev.ref,
  };
}

async function fetchLink(ev: Extract<Evidence, { kind: "link" }>, env: Env): Promise<FetchResult> {
  let body: string;
  if (ev.needs === "gh") {
    const result = await env.run(["gh", "api", ev.url]);
    if (result.code !== 0) return { ok: false, reason: result.stderr.trim() || "gh api failed" };
    body = result.stdout;
  } else {
    const res = await env.fetch(ev.url);
    if (res.status !== 200) return { ok: false, reason: `status ${res.status}` };
    body = res.body;
  }
  return plain(capAround(body, ev.excerpt), ev.url);
}

async function fetchQuery(ev: Extract<Evidence, { kind: "query" }>, env: Env, docDir: string): Promise<FetchResult> {
  const sqlFile = Bun.file(join(docDir, ev.sql));
  if (!(await sqlFile.exists())) return { ok: false, reason: `sql file not found: ${ev.sql}` };
  const sql = await sqlFile.text();
  const result = await env.run(["snow", "sql", "--format", "json", "-q", sql]);
  if (result.code !== 0) return { ok: false, reason: result.stderr.trim() || "snow sql failed" };
  const rows = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
  return plain(cap(`SQL:\n${sql}\n\nRows:\n${JSON.stringify(rows, null, 2)}`), sql, { rows });
}

async function fetchRecord(ev: Extract<Evidence, { kind: "record" }>, env: Env): Promise<FetchResult> {
  let record: unknown;
  if (ev.needs === "gh") {
    const result = await env.run(["gh", "api", ev.ref]);
    if (result.code !== 0) return { ok: false, reason: result.stderr.trim() || "gh api failed" };
    record = JSON.parse(result.stdout);
  } else if (ev.needs === "snow") {
    const result = await env.run(["snow", "sql", "--format", "json", "-q", ev.ref]);
    if (result.code !== 0) return { ok: false, reason: result.stderr.trim() || "snow sql failed" };
    record = (JSON.parse(result.stdout) as Array<Record<string, unknown>>)[0];
  } else {
    const res = await env.fetch(ev.ref);
    if (res.status !== 200) return { ok: false, reason: `status ${res.status}` };
    record = JSON.parse(res.body);
  }
  return plain(cap(JSON.stringify(record, null, 2) ?? "null"), `${ev.ref} ${ev.field}`, { record });
}

export async function fetchEvidence(ev: Evidence, env: Env, docDir: string): Promise<FetchResult> {
  if (ev.kind === "mcp") return { ok: false, reason: "needs a human verdict" };
  try {
    switch (ev.kind) {
      case "code":
        return await fetchCode(ev, env);
      case "link":
        return await fetchLink(ev, env);
      case "query":
        return await fetchQuery(ev, env, docDir);
      case "record":
        return await fetchRecord(ev, env);
    }
  } catch (err) {
    return { ok: false, reason: `error: ${(err as Error).message}` };
  }
}
