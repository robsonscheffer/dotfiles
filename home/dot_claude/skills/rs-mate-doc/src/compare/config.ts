// Reads compare.command: the base agent-CLI invocation `mate-doc compare` extends with
// the core flag (with core) and --model (when given). Loaded from the `compare:` key of
// ${XDG_CONFIG_HOME:-~/.config}/mate-doc/config.yaml, same file as the publish adapters
// config. Falls back to `claude -p --safe-mode` when the key or the file is missing:
// `--bare` skips keychain and OAuth reads, so a normal logged-in user gets an auth error;
// `--safe-mode` keeps the login and disables CLAUDE.md, skills, plugins, and hooks, which is
// the isolation compare needs. Also reads compare.core_flag, the flag that appends the core
// rules file as a system prompt for the with-core invocation, default
// --append-system-prompt-file.
import { join } from "node:path";

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

async function loadCompareConfig(env: ConfigEnvLike): Promise<{ command?: unknown; core_flag?: unknown } | null> {
  const configPath = defaultConfigPath(env);
  const file = Bun.file(configPath);
  if (!(await file.exists())) return null;

  const text = await file.text();
  const parsed = Bun.YAML.parse(text) as { compare?: { command?: unknown; core_flag?: unknown } } | null | undefined;
  return parsed?.compare ?? null;
}

export async function loadCompareCommand(env: ConfigEnvLike): Promise<string[]> {
  const compare = await loadCompareConfig(env);
  const command = compare?.command;
  if (typeof command !== "string" || command.trim().length === 0) {
    return splitCommand(DEFAULT_COMPARE_COMMAND);
  }
  return splitCommand(command);
}

export async function loadCompareCoreFlag(env: ConfigEnvLike): Promise<string> {
  const compare = await loadCompareConfig(env);
  const coreFlag = compare?.core_flag;
  if (typeof coreFlag !== "string" || coreFlag.trim().length === 0) {
    return DEFAULT_CORE_FLAG;
  }
  return coreFlag;
}
