import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import { loadLedger } from "../../src/ledger/index.ts";
import { stableLedgerHash } from "../../src/publish/hash.ts";
import type { Env, RunResult } from "../../src/types.ts";
import type { PublishFetch, PublishFetchResponse } from "../../src/publish/driver-mcp-share.ts";
import type { PublishDeps } from "../../src/publish/index.ts";

const dirs: string[] = [];
export function trackTempDir(dir: string): string {
  dirs.push(dir);
  return dir;
}
export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-publish-"));
  // /tmp is a symlink to /private/tmp on macOS: realpath before anything gets keyed by path.
  return trackTempDir(await realpath(dir));
}
export async function cleanupTempDirs(): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
}

export function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    has: () => true,
    run: async (): Promise<RunResult> => ({ code: 0, stdout: "", stderr: "" }),
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-25T00:00:00Z"),
    ...overrides,
  };
}

export const GOOD_CLAIM = {
  id: "C1",
  claim: "Self-serve pricing starts at $40 a month.",
  status: "verified",
  evidence: { kind: "link", url: "https://example.com/pricing", excerpt: "$40", needs: "http" },
  verdict: "supports",
  checked_by: "agent:claude",
  checked_at: "2026-09-20",
  ttl_days: 30,
};

export const SLACK_CLAIM = {
  id: "C2",
  claim: "The orders team agreed to keep the label rule.",
  status: "verified",
  evidence: {
    kind: "mcp",
    source: "https://chat.example.test/archives/C000/p1700000000",
    excerpt: "Agreed, we keep it.",
    needs: "mcp:slack",
  },
  verdict: "supports",
  checked_by: "agent:claude",
  checked_at: "2026-09-20",
  ttl_days: 30,
};

export async function writeClaimsYaml(dir: string, claims: unknown[]): Promise<void> {
  await writeFile(join(dir, "claims.yaml"), `claims:\n${claims.map((c) => "  - " + JSON.stringify(c)).join("\n")}`);
}

interface OfficialDocOptions {
  filename?: string; // default index.md
  claimRefs?: string[]; // e.g. ["C1"]
  sources?: string[];
  extraFrontmatter?: string; // raw yaml lines, no trailing newline needed
}

// Writes an index.md with real frontmatter and a real ledger_hash: reparses after the first
// write to compute the hash the same way publish() will, so the two never drift.
export async function writeOfficialDoc(dir: string, opts: OfficialDocOptions = {}): Promise<string> {
  const filename = opts.filename ?? "index.md";
  const path = join(dir, filename);
  const refsLine = (opts.claimRefs ?? ["C1"]).map((id) => `{${id}}`).join(" ");
  const sourcesYaml = opts.sources?.length ? `sources: [${opts.sources.map((s) => JSON.stringify(s)).join(", ")}]\n` : "";
  const body = () =>
    `---\ntitle: Checkout\nstatus: official\n${sourcesYaml}${opts.extraFrontmatter ?? ""}---\n\nPricing note. ${refsLine}\n`;

  await writeFile(path, body());
  const ledger = await loadLedger(dir);
  const src = await Bun.file(path).text();
  const doc = parse(src, path);
  const hash = stableLedgerHash([doc], ledger);

  await writeFile(
    path,
    `---\ntitle: Checkout\nstatus: official\nledger_hash: ${hash}\n${sourcesYaml}${opts.extraFrontmatter ?? ""}---\n\nPricing note. ${refsLine}\n`,
  );
  return path;
}

export function jsonRpcSuccess(payload: { url: string; slug: string; owner_key: string }): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: { isError: false, content: [{ text: JSON.stringify(payload) }] },
  });
}

export function fakeFetchOk(payload: { url: string; slug: string; owner_key: string }): PublishFetch {
  return async (): Promise<PublishFetchResponse> => ({
    status: 200,
    text: async () => jsonRpcSuccess(payload),
  });
}

export function recordingFetch(payload: { url: string; slug: string; owner_key: string }): {
  fetch: PublishFetch;
  calls: { url: string; body: string }[];
} {
  const calls: { url: string; body: string }[] = [];
  const fetch: PublishFetch = async (url, init) => {
    calls.push({ url, body: init.body });
    return { status: 200, text: async () => jsonRpcSuccess(payload) };
  };
  return { fetch, calls };
}

export function baseDeps(overrides: Partial<PublishDeps> = {}): PublishDeps {
  return {
    env: fakeEnv(),
    parse,
    render,
    fetchImpl: fakeFetchOk({ url: "https://share.example.test/d/abc123", slug: "abc123", owner_key: "secret-key-0000" }),
    processEnv: {},
    isTTY: true,
    confirm: async () => true,
    ...overrides,
  };
}

export async function writeAdapters(dir: string, yaml: string): Promise<string> {
  const path = join(dir, "adapters.yaml");
  await writeFile(path, yaml);
  return path;
}

export const DEFAULT_ADAPTERS_YAML = `adapters:
  http: { company: false }
  mcp:slack: { company: true }
company_hosts: [example.internal]
targets:
  share:
    driver: mcp-share
    endpoint: https://share.example.test/mcp
    tool_create: share
    tool_update: update
    company_ok: true
    verified: true
  external:
    driver: mcp-share
    endpoint: https://share.example.test/mcp
    tool_create: share
    tool_update: update
    company_ok: false
    verified: true
  unverified:
    driver: mcp-share
    endpoint: https://share.example.test/mcp
    tool_create: share
    tool_update: update
    company_ok: true
    verified: false
`;
