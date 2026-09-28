// Resolves a "<owner>/<repo>" slug to a local checkout path, via a small, deliberately
// machine-local "repos:" map (never checked into dotfiles).
//
// Source, in order:
//   1. MATE_DOC_ADAPTERS: one path, or several joined with ":", each a YAML file with a
//      top-level "repos:" map. All of them get merged.
//   2. Else, the "adapters:" list from ${XDG_CONFIG_HOME:-~/.config}/mate-doc/config.yaml
//      (bin/setup writes that key as an empty list): each entry is itself a path to an
//      adapters file with its own "repos:" map, merged the same way.
// A missing file at any level just means an empty map, not an error.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface AdaptersFile {
  repos?: Record<string, string>;
}

async function readYaml(path: string): Promise<AdaptersFile | null> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = Bun.YAML.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as AdaptersFile) : null;
  } catch {
    return null;
  }
}

function configPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(xdg, "mate-doc", "config.yaml");
}

async function mergeReposFrom(paths: string[]): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};
  for (const path of paths) {
    const data = await readYaml(path);
    if (data?.repos) Object.assign(merged, data.repos);
  }
  return merged;
}

async function loadReposMap(): Promise<Record<string, string>> {
  const override = process.env.MATE_DOC_ADAPTERS;
  if (override) {
    return mergeReposFrom(override.split(":").filter(Boolean));
  }

  const cfg = await readYaml(configPath());
  const adapterPaths = (cfg as { adapters?: unknown } | null)?.adapters;
  if (!Array.isArray(adapterPaths) || adapterPaths.length === 0) return {};
  return mergeReposFrom(adapterPaths.filter((p): p is string => typeof p === "string"));
}

export async function resolveRepoPath(slug: string): Promise<string | null> {
  const repos = await loadReposMap();
  return repos[slug] ?? null;
}
