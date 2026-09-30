// Reads compare.command: the base agent-CLI invocation `mate-doc compare` extends with
// the core flag (with core) and --model (when given). Loaded from the `compare:` key of
// ${XDG_CONFIG_HOME:-~/.config}/mate-doc/config.yaml, same file as the publish adapters
// config. Falls back to `claude -p --safe-mode` when the key or the file is missing:
// `--bare` skips keychain and OAuth reads, so a normal logged-in user gets an auth error;
// `--safe-mode` keeps the login and disables CLAUDE.md, skills, plugins, and hooks, which is
// the isolation compare needs. Also reads compare.core_flag, the flag that appends the core
// rules file as a system prompt for the with-core invocation, default
// --append-system-prompt-file.
//
// loadCompareConfig reads the full three-pane shape: command, system_flag, isolate_flags, and
// checks (the metrics run on every pane's answer). The older loaders stay until compare.ts
// moves to it.
import { join } from "node:path";
import type { CheckSpec, CompareConfig } from "./types.ts";

export const DEFAULT_COMPARE_COMMAND = "claude -p --safe-mode";
export const DEFAULT_CORE_FLAG = "--append-system-prompt-file";

export interface ConfigEnvLike {
  [key: string]: string | undefined;
}

function defaultConfigPath(env: ConfigEnvLike): string {
  const xdgConfig = env.XDG_CONFIG_HOME || join(env.HOME || "", ".config");
  return join(xdgConfig, "mate-doc", "config.yaml");
}

// Splits a shell-ish command string on whitespace. No quoting support: a `compare.command`
// value with a quoted argument is not expected to be common, and adding a shell-quote parser
// here is not worth it until someone needs it.
export function splitCommand(command: string): string[] {
  return command.trim().split(/\s+/).filter((part) => part.length > 0);
}

async function loadRawCompare(env: ConfigEnvLike): Promise<Record<string, unknown> | null> {
  const configPath = defaultConfigPath(env);
  const file = Bun.file(configPath);
  if (!(await file.exists())) return null;

  const text = await file.text();
  const parsed = Bun.YAML.parse(text) as { compare?: Record<string, unknown> } | null | undefined;
  return parsed?.compare ?? null;
}

export async function loadCompareCommand(env: ConfigEnvLike): Promise<string[]> {
  const compare = await loadRawCompare(env);
  const command = compare?.command;
  if (typeof command !== "string" || command.trim().length === 0) {
    return splitCommand(DEFAULT_COMPARE_COMMAND);
  }
  return splitCommand(command);
}

export async function loadCompareCoreFlag(env: ConfigEnvLike): Promise<string> {
  const compare = await loadRawCompare(env);
  const coreFlag = compare?.core_flag;
  if (typeof coreFlag !== "string" || coreFlag.trim().length === 0) {
    return DEFAULT_CORE_FLAG;
  }
  return coreFlag;
}

export const DEFAULT_PANE_COMMAND = "claude --permission-mode bypassPermissions";
export const DEFAULT_ISOLATE_FLAGS = "--setting-sources project,local";
export const DEFAULT_CHECKS: CheckSpec[] = [
  { name: "words", kind: "words" },
  { name: "em-dashes", kind: "count", pattern: "\u2014" },
];

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseCheck(entry: unknown): CheckSpec | null {
  if (typeof entry !== "object" || entry === null) return null;
  const e = entry as Record<string, unknown>;
  const name = nonEmptyString(e.name);
  if (!name) return null;
  switch (e.kind) {
    case "words":
      if (e.max === undefined) return { name, kind: "words" };
      return typeof e.max === "number" ? { name, kind: "words", max: e.max } : null;
    case "count": {
      const pattern = nonEmptyString(e.pattern);
      return pattern ? { name, kind: "count", pattern } : null;
    }
    case "ends_with": {
      const pattern = nonEmptyString(e.pattern);
      return pattern ? { name, kind: "ends_with", pattern } : null;
    }
    case "phrases":
      if (!Array.isArray(e.list) || !e.list.every((p) => typeof p === "string")) return null;
      return { name, kind: "phrases", list: e.list as string[] };
    case "long_paragraphs":
      return typeof e.max_lines === "number" ? { name, kind: "long_paragraphs", max_lines: e.max_lines } : null;
    default:
      return null;
  }
}

export async function loadCompareConfig(env: ConfigEnvLike): Promise<CompareConfig> {
  const raw = await loadRawCompare(env);
  const command = nonEmptyString(raw?.command) ?? DEFAULT_PANE_COMMAND;
  const systemFlag = nonEmptyString(raw?.system_flag) ?? DEFAULT_CORE_FLAG;
  const isolate = nonEmptyString(raw?.isolate_flags) ?? DEFAULT_ISOLATE_FLAGS;
  const parsed = Array.isArray(raw?.checks)
    ? raw.checks.map(parseCheck).filter((c): c is CheckSpec => c !== null)
    : [];
  return {
    command: splitCommand(command),
    systemFlag: systemFlag.trim(),
    isolateFlags: splitCommand(isolate),
    checks: parsed.length > 0 ? parsed : DEFAULT_CHECKS.map((c) => ({ ...c })),
  };
}
