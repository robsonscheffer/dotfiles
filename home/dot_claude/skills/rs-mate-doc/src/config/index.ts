// User config for mate-doc's own commands: ${XDG_CONFIG_HOME:-~/.config}/mate-doc/config.yaml,
// or MATE_DOC_CONFIG to point at another file. Personal to the user's machine - nothing company-
// specific ships in code. src/publish/adapters.ts reads the same file's "adapters:" key on its
// own; this module only reads "walk:" (currently just walk.close_hook, src/walk/close.ts).
export interface ProcessEnvLike {
  [key: string]: string | undefined;
}

export interface WalkConfig {
  close_hook?: string;
}

export interface MateDocConfig {
  walk?: WalkConfig;
}

function configPath(env: ProcessEnvLike): string {
  if (env.MATE_DOC_CONFIG) return env.MATE_DOC_CONFIG;
  const xdgConfig = env.XDG_CONFIG_HOME || `${env.HOME ?? ""}/.config`;
  return `${xdgConfig}/mate-doc/config.yaml`;
}

export async function loadConfig(env: ProcessEnvLike): Promise<MateDocConfig> {
  const path = configPath(env);
  const file = Bun.file(path);
  if (!(await file.exists())) return {};
  const text = await file.text();
  const parsed = Bun.YAML.parse(text) as MateDocConfig | null | undefined;
  return parsed ?? {};
}

export async function loadWalkCloseHook(env: ProcessEnvLike): Promise<string | undefined> {
  const config = await loadConfig(env);
  return config.walk?.close_hook;
}
