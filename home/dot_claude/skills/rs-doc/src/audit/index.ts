// Audit: run capability checkers against ledger evidence, report freshness and worklist.
import { loadLedger } from "../ledger/index.ts";
import type {
  AuditResult,
  AuditWorkItem,
  CheckResult,
  Claim,
  CodeEvidence,
  Env,
  Evidence,
  Freshness,
  LinkEvidence,
  QueryEvidence,
  RecordEvidence,
  StaleReason,
} from "../types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function isExpired(claim: Claim, now: Date): boolean {
  if (!claim.checked_at || claim.ttl_days === undefined) return false;
  const checkedAt = new Date(claim.checked_at).getTime();
  if (Number.isNaN(checkedAt)) return false;
  return checkedAt + claim.ttl_days * DAY_MS < now.getTime();
}

function nearLine(content: string, excerpt: string, line: number, window = 3): boolean {
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - window);
  const end = Math.min(lines.length, line - 1 + window + 1);
  return lines.slice(start, end).some((l) => l.includes(excerpt));
}

function getField(record: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, record);
}

function withinTolerance(actual: unknown, expect: number | string, tolerance?: number): boolean {
  if (typeof expect === "number") {
    const n = typeof actual === "number" ? actual : Number(actual);
    if (Number.isNaN(n)) return false;
    return Math.abs(n - expect) <= (tolerance ?? 0);
  }
  return String(actual) === expect;
}

// --- individual checkers, one per capability, all pure over an injected Env --------------------

async function checkCode(claim: Claim, ev: CodeEvidence, env: Env): Promise<CheckResult> {
  const match = /^([^@]+)@([^:]+):([^:]+):([0-9]+)$/.exec(ev.ref);
  if (!match) {
    return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: `malformed ref: ${ev.ref}` };
  }
  const [, repo, rev, path, lineStr] = match as unknown as [string, string, string, string, string];
  const line = Number(lineStr);
  try {
    if (ev.needs === "git") {
      const result = await env.run(["git", "show", `${rev}:${path}`]);
      if (result.code !== 0) {
        return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: result.stderr || "git show failed" };
      }
      const ok = nearLine(result.stdout, ev.excerpt, line);
      return { claim: claim.id, capability: ev.needs, ran: true, ok, detail: ok ? "excerpt found" : "excerpt not found near line" };
    }
    // needs === "gh": fetch file contents through the GitHub API.
    const result = await env.run(["gh", "api", `repos/${repo}/contents/${path}?ref=${rev}`]);
    if (result.code !== 0) {
      return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: result.stderr || "gh api failed" };
    }
    const parsed = JSON.parse(result.stdout) as { content?: string; encoding?: string };
    const content = parsed.content
      ? Buffer.from(parsed.content, (parsed.encoding as BufferEncoding) ?? "base64").toString("utf8")
      : "";
    const ok = nearLine(content, ev.excerpt, line);
    return { claim: claim.id, capability: ev.needs, ran: true, ok, detail: ok ? "excerpt found" : "excerpt not found near line" };
  } catch (err) {
    return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: `error: ${(err as Error).message}` };
  }
}

async function checkQuery(claim: Claim, ev: QueryEvidence, env: Env, docDir: string): Promise<CheckResult> {
  try {
    const sqlFile = Bun.file(`${docDir}/${ev.sql}`);
    if (!(await sqlFile.exists())) {
      return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: `sql file not found: ${ev.sql}` };
    }
    const sql = await sqlFile.text();
    const result = await env.run(["snow", "sql", "--format", "json", "-q", sql]);
    if (result.code !== 0) {
      return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: result.stderr || "snow sql failed" };
    }
    const rows = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    if (ev.expect.rows !== undefined && rows.length !== ev.expect.rows) {
      return {
        claim: claim.id,
        capability: ev.needs,
        ran: true,
        ok: false,
        detail: `expected ${ev.expect.rows} rows, got ${rows.length}`,
      };
    }
    if (ev.expect.value !== undefined) {
      const firstRow = rows[0];
      const actual = firstRow ? Object.values(firstRow)[0] : undefined;
      const ok = withinTolerance(actual, ev.expect.value, ev.expect.tolerance);
      return { claim: claim.id, capability: ev.needs, ran: true, ok, detail: `expected ${ev.expect.value}, got ${actual}` };
    }
    return { claim: claim.id, capability: ev.needs, ran: true, ok: true, detail: `${rows.length} rows` };
  } catch (err) {
    return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: `error: ${(err as Error).message}` };
  }
}

async function checkLink(claim: Claim, ev: LinkEvidence, env: Env): Promise<CheckResult> {
  try {
    if (ev.needs === "gh") {
      const result = await env.run(["gh", "api", ev.url]);
      if (result.code !== 0) {
        return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: result.stderr || "gh api failed" };
      }
      const ok = !ev.excerpt || result.stdout.includes(ev.excerpt);
      return { claim: claim.id, capability: ev.needs, ran: true, ok, detail: ok ? "matched" : "excerpt not found" };
    }
    const { status, body } = await env.fetch(ev.url);
    const ok = status === 200 && (!ev.excerpt || body.includes(ev.excerpt));
    return {
      claim: claim.id,
      capability: ev.needs,
      ran: true,
      ok,
      detail: ok ? "matched" : `status ${status}${ev.excerpt ? ", excerpt check" : ""}`,
    };
  } catch (err) {
    return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: `error: ${(err as Error).message}` };
  }
}

async function checkRecord(claim: Claim, ev: RecordEvidence, env: Env): Promise<CheckResult> {
  try {
    let record: unknown;
    if (ev.needs === "gh") {
      const result = await env.run(["gh", "api", ev.ref]);
      if (result.code !== 0) {
        return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: result.stderr || "gh api failed" };
      }
      record = JSON.parse(result.stdout);
    } else if (ev.needs === "snow") {
      const result = await env.run(["snow", "sql", "--format", "json", "-q", ev.ref]);
      if (result.code !== 0) {
        return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: result.stderr || "snow sql failed" };
      }
      const rows = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
      record = rows[0];
    } else {
      const { status, body } = await env.fetch(ev.ref);
      if (status !== 200) {
        return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: `status ${status}` };
      }
      record = JSON.parse(body);
    }
    const actual = getField(record, ev.field);
    const ok =
      typeof ev.expect === "boolean" ? actual === ev.expect : withinTolerance(actual, ev.expect as number | string);
    return { claim: claim.id, capability: ev.needs, ran: true, ok, detail: `${ev.field} = ${actual}` };
  } catch (err) {
    return { claim: claim.id, capability: ev.needs, ran: true, ok: false, detail: `error: ${(err as Error).message}` };
  }
}

async function runEvidenceCheck(claim: Claim, ev: Evidence, env: Env, docDir: string): Promise<CheckResult> {
  if (ev.kind === "mcp") {
    return { claim: claim.id, capability: ev.needs, ran: false, ok: null, detail: "mcp evidence is never run by code" };
  }
  if (!env.has(ev.needs)) {
    return { claim: claim.id, capability: ev.needs, ran: false, ok: null, detail: `capability ${ev.needs} unavailable` };
  }
  switch (ev.kind) {
    case "code":
      return checkCode(claim, ev, env);
    case "query":
      return checkQuery(claim, ev, env, docDir);
    case "link":
      return checkLink(claim, ev, env);
    case "record":
      return checkRecord(claim, ev, env);
  }
}

export { runEvidenceCheck, checkCode, checkQuery, checkLink, checkRecord };

export async function audit(docDir: string, env: Env): Promise<AuditResult> {
  const ledger = await loadLedger(docDir);
  const checks: CheckResult[] = [];
  const stale: Freshness["stale"] = [];
  const worklist: AuditWorkItem[] = [];
  const now = env.now();

  for (const claim of ledger?.claims ?? []) {
    if (claim.status === "not_verified" || !claim.evidence) continue;

    const expired = isExpired(claim, now);
    if (expired) {
      stale.push({ claim: claim.id, reason: "ttl" as StaleReason, detail: `ttl_days ${claim.ttl_days} elapsed` });
    }

    if (claim.evidence.kind === "mcp") {
      checks.push({
        claim: claim.id,
        capability: claim.evidence.needs,
        ran: false,
        ok: null,
        detail: "mcp evidence is never run by code",
      });
      worklist.push({
        claim: claim.id,
        reason: "mcp",
        needs: claim.evidence.needs,
        source: claim.evidence.source,
        sentence: claim.claim,
      });
      continue;
    }

    if (!claim.verdict) {
      // Never checked before: needs an initial LLM verdict before it can be trusted.
      if (!env.has(claim.evidence.needs)) {
        stale.push({ claim: claim.id, reason: "capability-missing", detail: `capability ${claim.evidence.needs} unavailable` });
        worklist.push({
          claim: claim.id,
          reason: "capability-missing",
          needs: claim.evidence.needs,
          source: evidenceSource(claim.evidence),
          sentence: claim.claim,
        });
      } else {
        worklist.push({
          claim: claim.id,
          reason: "new",
          needs: claim.evidence.needs,
          source: evidenceSource(claim.evidence),
          sentence: claim.claim,
        });
      }
      continue;
    }

    if (!env.has(claim.evidence.needs)) {
      checks.push({ claim: claim.id, capability: claim.evidence.needs, ran: false, ok: null, detail: `capability ${claim.evidence.needs} unavailable` });
      stale.push({ claim: claim.id, reason: "capability-missing", detail: `capability ${claim.evidence.needs} unavailable` });
      worklist.push({
        claim: claim.id,
        reason: "capability-missing",
        needs: claim.evidence.needs,
        source: evidenceSource(claim.evidence),
        sentence: claim.claim,
      });
      continue;
    }

    if (expired) {
      worklist.push({
        claim: claim.id,
        reason: "expired",
        needs: claim.evidence.needs,
        source: evidenceSource(claim.evidence),
        sentence: claim.claim,
      });
      continue;
    }

    const result = await runEvidenceCheck(claim, claim.evidence, env, docDir);
    checks.push(result);
    if (result.ok === false) {
      stale.push({ claim: claim.id, reason: "drift", detail: result.detail });
      worklist.push({
        claim: claim.id,
        reason: "drift",
        needs: claim.evidence.needs,
        source: evidenceSource(claim.evidence),
        sentence: claim.claim,
      });
    }
  }

  return { docDir, checks, freshness: { fresh: stale.length === 0, stale }, worklist };
}

function evidenceSource(ev: Evidence): string {
  switch (ev.kind) {
    case "code":
      return ev.ref;
    case "query":
      return ev.sql;
    case "link":
      return ev.url;
    case "record":
      return ev.ref;
    case "mcp":
      return ev.source;
  }
}
