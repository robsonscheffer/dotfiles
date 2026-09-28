// mate-doc publish: share an official, fresh, gate-passing doc to a configured target.
//
// This is the entry point the CLI orchestrator wires `mate-doc publish <path> --to <target>`
// onto. It owns every refusal rule; the CLI's job is only to parse argv and supply the deps
// below (a real Env, the real parse/render, a real fetch, a real TTY check and confirm prompt).
import { readFile } from "node:fs/promises";
import { audit } from "../audit/index.ts";
import { loadLedger } from "../ledger/index.ts";
import { gate } from "../gate/index.ts";
import type { Doc, Env, Frontmatter, Parse, Render } from "../types.ts";
import { loadAdapters, type AdaptersConfig } from "./adapters.ts";
import { buildDoc, resolveDoc, type ResolvedDoc } from "./build.ts";
import { shareCreate, shareUpdate, type PublishFetch } from "./driver-mcp-share.ts";
import { computeProvenance } from "./egress.ts";
import { stableLedgerHash } from "./hash.ts";
import {
  defaultStateDir,
  existingPublishedEntry,
  maskOwnerKey,
  recordPublish,
  type StateEnvLike,
} from "./state.ts";

export { publishedCopies } from "./state.ts";
export type { PublishedEntry } from "./state.ts";
export { loadAdapters } from "./adapters.ts";
export type { AdaptersConfig, TargetConfig } from "./adapters.ts";

const AGENT_ENV_VARS = ["CLAUDECODE", "CODEX_SANDBOX", "MATE_DOC_AGENT"] as const;

export interface PublishOptions {
  docPath: string;
  target: string;
}

export interface PublishDeps {
  env: Env; // real Env for gate/audit
  parse: Parse;
  render: Render;
  fetchImpl: PublishFetch; // injected transport; never a real network call in tests
  processEnv: StateEnvLike; // process.env, or a fake for tests
  isTTY: boolean; // stdin.isTTY
  confirm: (question: string) => Promise<boolean>;
}

export interface PublishResult {
  code: 0 | 1;
  message: string;
  url?: string;
  slug?: string;
}

function refuse(message: string): PublishResult {
  return { code: 1, message };
}

async function loadFrontmatters(mdPaths: string[], parse: Parse): Promise<{ docs: Doc[]; frontmatters: Frontmatter[] }> {
  const docs: Doc[] = [];
  for (const path of mdPaths) {
    const src = await readFile(path, "utf8");
    docs.push(parse(src, path));
  }
  return { docs, frontmatters: docs.map((d) => d.frontmatter) };
}

async function allMarkdownPaths(resolved: ResolvedDoc): Promise<string[]> {
  if (!resolved.isFolder) return [resolved.primaryMdPath];
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
    }
  }
  await walk(resolved.docDir);
  return out.sort();
}

export async function publish(opts: PublishOptions, deps: PublishDeps): Promise<PublishResult> {
  // Rule 1 & 2: target must exist and be verified.
  const adaptersResult = await loadAdapters(deps.processEnv);
  if (!adaptersResult.ok) return refuse(adaptersResult.reason);
  const adapters: AdaptersConfig = adaptersResult.config;

  const target = adapters.targets[opts.target];
  if (!target) return refuse(`target "${opts.target}" is not configured`);
  if (!target.verified) {
    return refuse(`target ${opts.target} is not verified; confirm its login gate first`);
  }

  // Resolve the doc folder and its pages up front; every later rule needs them.
  const resolved = await resolveDoc(opts.docPath);
  const mdPaths = await allMarkdownPaths(resolved);
  const { docs, frontmatters } = await loadFrontmatters(mdPaths, deps.parse);
  const ledger = await loadLedger(resolved.docDir);

  const primaryDoc = docs.find((d) => d.path === resolved.primaryMdPath);
  const primaryFrontmatter = primaryDoc?.frontmatter;

  // Rule 3: doc must be official, and its ledger_hash must still match the current content.
  if (primaryFrontmatter?.status !== "official") {
    return refuse(`${opts.docPath} is not official (status: ${primaryFrontmatter?.status ?? "draft"})`);
  }
  const currentHash = stableLedgerHash(docs, ledger, resolved.docDir);
  if (primaryFrontmatter.ledger_hash !== currentHash) {
    return refuse(`${opts.docPath} has changed since it was approved; ledger_hash no longer matches`);
  }

  // Rule 4: gate must pass and freshness must hold, checked with the real Env.
  const gateResult = await gate(resolved.docDir, deps.env);
  const auditResult = await audit(resolved.docDir, deps.env);
  if (!gateResult.pass || !auditResult.freshness.fresh) {
    const reasons = [
      ...gateResult.reasons.map((r) => r.message),
      ...auditResult.freshness.stale.map((s) => `${s.claim}: ${s.reason} (${s.detail})`),
    ];
    return refuse(`${opts.docPath} does not pass gate: ${reasons.join("; ")}`);
  }

  // Rule 5: egress. Company-provenance evidence may only go to a company_ok target.
  const provenance = computeProvenance(ledger, frontmatters, adapters);
  if (provenance.isCompany && !target.company_ok) {
    return refuse(
      `target ${opts.target} cannot receive company-provenance evidence: ${provenance.companySources.join(", ")}`,
    );
  }

  // Rule 6: confirm, unless running unattended or non-interactively.
  const stateDir = defaultStateDir(deps.processEnv);
  const existing = await existingPublishedEntry(stateDir, opts.docPath, opts.target);
  const host = new URL(target.endpoint).host;
  const action = existing ? "update" : "create";
  const slugPart = existing ? ` (slug ${existing.slug})` : "";
  const destination = `${opts.target} (${host}, ${action}${slugPart})`;

  const agentVar = AGENT_ENV_VARS.find((name) => deps.processEnv[name] !== undefined);
  if (agentVar) {
    return refuse(`refusing to publish: ${agentVar} is set, this looks like an unattended agent run`);
  }
  if (!deps.isTTY) {
    return refuse("refusing to publish: stdin is not a TTY, cannot confirm interactively");
  }
  const confirmed = await deps.confirm(`Publish ${opts.docPath} to ${destination}? [y/N] `);
  if (!confirmed) {
    return refuse(`publish to ${opts.target} cancelled`);
  }

  // Rule 7: build and send.
  const built = await buildDoc(resolved, ledger, deps.parse, deps.render);
  const content =
    built.kind === "page"
      ? { html_content: built.html }
      : { zip_content: Buffer.from(built.zip).toString("base64") };

  const result = existing
    ? await shareUpdate(deps.fetchImpl, target, existing.slug, existing.owner_key, content)
    : await shareCreate(deps.fetchImpl, target, content);

  if (result.isError) {
    return refuse(`publish to ${opts.target} failed: ${result.detail}`);
  }

  await recordPublish(stateDir, opts.docPath, opts.target, {
    slug: result.slug,
    owner_key: result.owner_key,
    url: result.url,
    published_at: deps.env.now().toISOString(),
    ledger_hash: currentHash,
  });

  return {
    code: 0,
    message: `published ${opts.docPath} to ${opts.target}: ${result.url} (owner key ${maskOwnerKey(result.owner_key)})`,
    url: result.url,
    slug: result.slug,
  };
}
