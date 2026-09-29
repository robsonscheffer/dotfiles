// Reads compare.command: the base agent-CLI invocation `mate-doc compare` extends with
// --append-system-prompt-file (with core) and --model (when given). Loaded from the
// `compare:` key of ${XDG_CONFIG_HOME:-~/.config}/mate-doc/config.yaml, same file as the
// publish adapters config. Falls back to `claude -p --bare` when the key or the file is
// missing.
import { join } from "node:path";

export const DEFAULT_COMPARE_COMMAND = "claude -p --bare";

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

export async function loadCompareCommand(env: ConfigEnvLike): Promise<string[]> {
  const configPath = defaultConfigPath(env);
  const file = Bun.file(configPath);
  if (!(await file.exists())) return splitCommand(DEFAULT_COMPARE_COMMAND);

  const text = await file.text();
  const parsed = Bun.YAML.parse(text) as { compare?: { command?: unknown } } | null | undefined;
  const command = parsed?.compare?.command;
  if (typeof command !== "string" || command.trim().length === 0) {
    return splitCommand(DEFAULT_COMPARE_COMMAND);
  }
  return splitCommand(command);
}
