// Runs one claim through a fresh agent: fetch the evidence, check it mechanically, ask the
// agent, guard the answer, and hand back what to write. Never writes the ledger itself.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_COMPARE_COMMAND, splitCommand } from "../compare/config.ts";
import type { Claim, Env, Verdict } from "../types.ts";
import { mechanicalCheck } from "./check.ts";
import { AGENT_TIMEOUT_MS, DEFAULT_MODEL } from "./constants.ts";
import { fetchEvidence } from "./fetch.ts";
import { buildPrompt } from "./prompt.ts";
import { schemaArg, VERDICT_VALUES } from "./schema.ts";

type EnvVars = Record<string, string | undefined>;

export interface VerifyConfig {
  command: string[];
  model?: string;
}

// Same file compare reads (${XDG_CONFIG_HOME:-~/.config}/mate-doc/config.yaml), `verify:` key.
export async function loadVerifyConfig(envVars: EnvVars = process.env): Promise<VerifyConfig> {
  const xdg = envVars.XDG_CONFIG_HOME || join(envVars.HOME || "", ".config");
  const file = Bun.file(join(xdg, "mate-doc", "config.yaml"));
  let section: { command?: unknown; model?: unknown } | null | undefined;
  if (await file.exists()) {
    const parsed = Bun.YAML.parse(await file.text()) as { verify?: typeof section } | null | undefined;
    section = parsed?.verify;
  }
  const command =
    typeof section?.command === "string" && section.command.trim().length > 0
      ? splitCommand(section.command)
      : splitCommand(DEFAULT_COMPARE_COMMAND);
  const model = typeof section?.model === "string" && section.model.trim().length > 0 ? section.model.trim() : undefined;
  return { command, model };
}

export function buildArgv(config: VerifyConfig, modelFlag?: string): string[] {
  const model = modelFlag ?? config.model ?? DEFAULT_MODEL;
  return [
    ...config.command,
    "--tools",
    "",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--json-schema",
    schemaArg(),
    "--model",
    model,
  ];
}

export type Prepared =
  | { kind: "ready"; prompt: string; window: string; raw: string }
  | { kind: "drift" }
  | { kind: "needs-human" }
  | { kind: "error"; detail: string };

// Everything before the agent call: fetch, mechanical check, build the prompt.
export async function prepareClaim(claim: Claim, env: Env, docDir: string): Promise<Prepared> {
  const ev = claim.evidence;
  if (!ev) return { kind: "error", detail: "no evidence" };
  if (ev.kind === "mcp") return { kind: "needs-human" };
  const fetched = await fetchEvidence(ev, env, docDir);
  if (!fetched.ok) {
    return fetched.reason === "needs a human verdict" ? { kind: "needs-human" } : { kind: "error", detail: fetched.reason };
  }
  if (!mechanicalCheck(ev, fetched)) return { kind: "drift" };
  return {
    kind: "ready",
    prompt: buildPrompt(claim.claim, ev.kind, fetched.ref, fetched.window),
    window: fetched.window,
    raw: fetched.raw,
  };
}

export type Judged =
  | { kind: "verdict"; verdict: Verdict; reason: string; modelId: string }
  | { kind: "quote-missing" }
  | { kind: "error"; detail: string };

export async function askVerifier(
  prompt: string,
  window: string,
  raw: string,
  argv: string[],
  fallbackModel: string,
  env: Env,
): Promise<Judged> {
  const cwd = await mkdtemp(join(tmpdir(), "mate-doc-verify-"));
  let stdout: string;
  try {
    const result = await env.run(argv, { input: prompt, cwd, timeoutMs: AGENT_TIMEOUT_MS });
    if (result.code !== 0) {
      return { kind: "error", detail: `agent exited ${result.code}: ${result.stderr.trim().slice(0, 200)}` };
    }
    stdout = result.stdout;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }

  let parsed: { structured_output?: unknown; modelUsage?: Record<string, unknown> };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { kind: "error", detail: "agent output was not JSON" };
  }
  const answer = parsed.structured_output as { verdict?: unknown; reason?: unknown; quote?: unknown } | undefined;
  if (!answer || typeof answer !== "object") return { kind: "error", detail: "agent gave no structured_output" };
  if (typeof answer.verdict !== "string" || !(VERDICT_VALUES as readonly string[]).includes(answer.verdict)) {
    return { kind: "error", detail: `unknown verdict: ${String(answer.verdict)}` };
  }
  const reason = typeof answer.reason === "string" ? answer.reason : "";
  const quote = typeof answer.quote === "string" ? answer.quote : "";
  const verdict = answer.verdict as Verdict;

  if (verdict === "supports" && (quote.length === 0 || (!raw.includes(quote) && !window.includes(quote)))) {
    return { kind: "quote-missing" };
  }
  const modelId = Object.keys(parsed.modelUsage ?? {})[0] ?? fallbackModel;
  return { kind: "verdict", verdict, reason, modelId };
}
