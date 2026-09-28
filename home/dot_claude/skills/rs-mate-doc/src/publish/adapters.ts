// Adapters config: evidence-capability provenance and publish targets.
// Loaded from MATE_DOC_ADAPTERS (the whole document), else the `adapters:` key of
// ${XDG_CONFIG_HOME:-~/.config}/mate-doc/config.yaml. Nothing company-specific ships in code.
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import { join } from "node:path";
import schema from "./adapters.schema.json";
import type { Capability } from "../types.ts";

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const validateSchema = ajv.compile(schema);

export interface AdapterEntry {
  company: boolean;
}

export interface TargetConfig {
  driver: "mcp-share";
  endpoint: string;
  tool_create: string;
  tool_update: string;
  company_ok: boolean;
  verified: boolean;
}

export interface AdaptersConfig {
  adapters: Record<string, AdapterEntry>;
  company_hosts: string[];
  targets: Record<string, TargetConfig>;
}

export type LoadAdaptersResult =
  | { ok: true; config: AdaptersConfig; source: string }
  | { ok: false; reason: string };

export interface Env2Like {
  [key: string]: string | undefined;
}

function defaultConfigPath(env: Env2Like): string {
  const xdgConfig = env.XDG_CONFIG_HOME || join(env.HOME || "", ".config");
  return join(xdgConfig, "mate-doc", "config.yaml");
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`).join("; ");
}

// Loads and validates the adapters document. Returns { ok: false } when no config file exists
// anywhere, or when it exists but fails schema validation. Never throws.
export async function loadAdapters(env: Env2Like): Promise<LoadAdaptersResult> {
  const explicitPath = env.MATE_DOC_ADAPTERS;
  if (explicitPath) {
    const file = Bun.file(explicitPath);
    if (!(await file.exists())) {
      return { ok: false, reason: `MATE_DOC_ADAPTERS is set to ${explicitPath}, which does not exist` };
    }
    const text = await file.text();
    const parsed = Bun.YAML.parse(text);
    return validate(parsed, explicitPath);
  }

  const configPath = defaultConfigPath(env);
  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    return { ok: false, reason: `no adapters config found (looked for ${configPath})` };
  }
  const text = await file.text();
  const parsed = Bun.YAML.parse(text) as { adapters?: unknown } | null | undefined;
  if (!parsed || parsed.adapters === undefined) {
    return { ok: false, reason: `${configPath} has no "adapters:" key` };
  }
  return validate(parsed.adapters, configPath);
}

function validate(candidate: unknown, source: string): LoadAdaptersResult {
  const ok = validateSchema(candidate);
  if (!ok) {
    return { ok: false, reason: `adapters config at ${source} is invalid: ${formatAjvErrors(validateSchema.errors)}` };
  }
  return { ok: true, config: candidate as unknown as AdaptersConfig, source };
}

// Whether a capability is company-provenance per the adapters map. Unknown capabilities default
// to false: only a capability explicitly marked company: true taints a doc.
export function isCompanyCapability(config: AdaptersConfig, capability: Capability): boolean {
  return config.adapters[capability]?.company === true;
}

// Whether a frontmatter `sources` host string matches a configured company host.
export function isCompanyHost(config: AdaptersConfig, source: string): boolean {
  const host = hostOf(source);
  return (config.company_hosts ?? []).includes(host);
}

function hostOf(source: string): string {
  try {
    return new URL(source).hostname;
  } catch {
    return source;
  }
}
