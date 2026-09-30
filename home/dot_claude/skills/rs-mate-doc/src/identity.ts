// Who is acting: an agent or a person. Used to keep authors from grading their own claims.
import { spawnSync } from "node:child_process";

// Twin of AGENT_ENV_VARS in src/commands/approve.ts. Keep the two lists in step.
const AGENT_ENV_VARS = ["CLAUDECODE", "CODEX_SANDBOX", "MATE_DOC_AGENT"];

type EnvVars = Record<string, string | undefined>;

export function isAgent(env: EnvVars = process.env): boolean {
  return AGENT_ENV_VARS.some((v) => env[v]);
}

function gitUserName(): string {
  const result = spawnSync("git", ["config", "user.name"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

export function detectActor(env: EnvVars = process.env, gitName: () => string = gitUserName): string {
  if (isAgent(env)) return `agent:${env.MATE_DOC_AGENT || "claude"}`;
  return `human:${gitName().trim() || "unknown"}`;
}

// True only for a fresh verifier or a person, and never the author of the doc.
export function isIndependent(checkedBy: string | undefined, author: string | undefined): boolean {
  if (!checkedBy) return false;
  if (!checkedBy.startsWith("verifier:") && !checkedBy.startsWith("human:")) return false;
  return checkedBy !== author;
}
