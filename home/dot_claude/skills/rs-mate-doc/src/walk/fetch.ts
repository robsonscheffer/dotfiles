// mate-doc walk Fetch step: PR metadata, body, diff, and file list via `gh`, exactly the way
// rs-walk's fetch-pr.sh and fetch-pr-comments.sh do it - body is its own `gh` call (PR bodies
// routinely carry control characters that break structured JSON parsing when bundled with the
// other fields), and comment fetching is non-fatal so a rate limit never aborts the whole walk.
import type { Env } from "../types.ts";
import type { FetchedPr, PrMeta, RawComments } from "./types.ts";

const PR_URL_RE = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/;
const SHORT_REF_RE = /^([^/\s]+\/[^/\s]+)#(\d+)$/;

export interface PrRef {
  repo: string;
  number: number;
}

// Accepts a full PR URL (https://github.com/org/repo/pull/123) or the short form
// (org/repo#123).
export function parsePrRef(input: string): PrRef {
  const trimmed = input.trim();
  const urlMatch = PR_URL_RE.exec(trimmed);
  if (urlMatch) return { repo: urlMatch[1]!, number: Number(urlMatch[2]) };
  const shortMatch = SHORT_REF_RE.exec(trimmed);
  if (shortMatch) return { repo: shortMatch[1]!, number: Number(shortMatch[2]) };
  throw new Error(`not a PR reference: "${input}" (expected a full PR URL or org/repo#123)`);
}

async function run(env: Env, cmd: string[], label: string): Promise<string> {
  const result = await env.run(cmd);
  if (result.code !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
  return result.stdout;
}

export async function fetchPr(repo: string, number: number, env: Env): Promise<FetchedPr> {
  const metaJson = await run(
    env,
    [
      "gh",
      "pr",
      "view",
      String(number),
      "--repo",
      repo,
      "--json",
      "number,title,author,headRefName,headRefOid,baseRefName,baseRefOid,additions,deletions,changedFiles,url",
    ],
    `gh pr view for ${repo}#${number}`,
  );
  const meta = JSON.parse(metaJson) as PrMeta;

  const body = await run(
    env,
    ["gh", "pr", "view", String(number), "--repo", repo, "--json", "body", "-q", ".body"],
    `gh pr view (body) for ${repo}#${number}`,
  );

  const diff = await run(env, ["gh", "pr", "diff", String(number), "--repo", repo], `gh pr diff for ${repo}#${number}`);

  const filesOut = await run(
    env,
    ["gh", "pr", "diff", String(number), "--repo", repo, "--name-only"],
    `gh pr diff --name-only for ${repo}#${number}`,
  );
  const files = filesOut
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  return { repo, meta, body, diff, files };
}

// Non-fatal by design, mirroring fetch-pr-comments.sh: a gh failure (rate limit, transient
// network) never aborts the walk. It just means comment triage gets skipped downstream.
export async function fetchPrComments(repo: string, number: number, env: Env): Promise<RawComments> {
  try {
    const result = await env.run(["gh", "pr", "view", String(number), "--repo", repo, "--json", "comments,reviews"]);
    if (result.code !== 0) return { comments: [], reviews: [] };
    const parsed = JSON.parse(result.stdout) as Partial<RawComments>;
    return { comments: parsed.comments ?? [], reviews: parsed.reviews ?? [] };
  } catch {
    return { comments: [], reviews: [] };
  }
}
