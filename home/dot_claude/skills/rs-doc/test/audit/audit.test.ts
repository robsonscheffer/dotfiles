import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit } from "../../src/audit/index.ts";
import type { Capability, Claim, Env, RunResult } from "../../src/types.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-audit-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function writeClaims(dir: string, claims: Claim[]): Promise<void> {
  await writeFile(join(dir, "claims.yaml"), `claims:\n${claims.map((c) => "  - " + JSON.stringify(c)).join("\n")}`);
}

// A fake runner: no real git, gh, or snow ever touches the network or filesystem outside dir.
function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    has: () => true,
    run: async (): Promise<RunResult> => ({ code: 0, stdout: "", stderr: "" }),
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-25T00:00:00Z"),
    ...overrides,
  };
}

const acmeCode: Claim = {
  id: "C7",
  claim: "Checkout clicks take their label from the nearest data-analytics-name attribute.",
  status: "verified",
  evidence: {
    kind: "code",
    ref: "acme/web@origin/main:src/analytics/label.ts:42",
    excerpt: "const label = el.closest('[data-analytics-name]')",
    needs: "git",
  },
  verdict: "supports",
  checked_by: "agent:claude",
  checked_at: "2026-09-20",
  ttl_days: 30,
};

describe("audit", () => {
  test("returns an empty result when there is no ledger", async () => {
    const dir = await tempDir();
    const result = await audit(dir, fakeEnv());
    expect(result.checks).toHaveLength(0);
    expect(result.freshness.fresh).toBe(true);
    expect(result.worklist).toHaveLength(0);
  });

  test("git evidence passes when the excerpt is near the recorded line", async () => {
    const dir = await tempDir();
    await writeClaims(dir, [acmeCode]);
    const fileLines = Array.from({ length: 50 }, (_, i) =>
      i === 41 ? "  const label = el.closest('[data-analytics-name]')?.dataset.analyticsName" : `line ${i}`,
    );
    const env = fakeEnv({
      run: async (cmd) => {
        expect(cmd[0]).toBe("git");
        return { code: 0, stdout: fileLines.join("\n"), stderr: "" };
      },
    });
    const result = await audit(dir, env);
    expect(result.checks[0]?.ok).toBe(true);
    expect(result.freshness.fresh).toBe(true);
    expect(result.worklist).toHaveLength(0);
  });

  test("git evidence fails and marks drift when the excerpt is gone", async () => {
    const dir = await tempDir();
    await writeClaims(dir, [acmeCode]);
    const env = fakeEnv({ run: async () => ({ code: 0, stdout: "nothing relevant here\n".repeat(50), stderr: "" }) });
    const result = await audit(dir, env);
    expect(result.checks[0]?.ok).toBe(false);
    expect(result.freshness.fresh).toBe(false);
    expect(result.freshness.stale.some((s) => s.reason === "drift")).toBe(true);
    expect(result.worklist.some((w) => w.reason === "drift")).toBe(true);
  });

  test("mcp evidence never runs and always lands on the worklist", async () => {
    const dir = await tempDir();
    const claim: Claim = {
      id: "C15",
      claim: "The orders team agreed to keep the label rule.",
      status: "verified",
      evidence: {
        kind: "mcp",
        source: "https://chat.example.com/archives/C000/p1700000000",
        excerpt: "Agreed, we keep the nearest-attribute rule for now.",
        needs: "mcp:slack",
      },
      verdict: "supports",
      checked_by: "agent:claude",
      checked_at: "2026-09-20",
      ttl_days: 30,
    };
    await writeClaims(dir, [claim]);
    const env = fakeEnv({ has: () => false });
    const result = await audit(dir, env);
    expect(result.checks[0]?.ran).toBe(false);
    expect(result.checks[0]?.ok).toBeNull();
    expect(result.worklist[0]?.reason).toBe("mcp");
  });

  test("missing capability marks capability-missing and lands on the worklist", async () => {
    const dir = await tempDir();
    await writeClaims(dir, [acmeCode]);
    const env = fakeEnv({ has: (cap: Capability) => cap !== "git" });
    const result = await audit(dir, env);
    expect(result.freshness.stale.some((s) => s.reason === "capability-missing")).toBe(true);
    expect(result.worklist[0]?.reason).toBe("capability-missing");
  });

  test("a never-verdicted claim goes on the worklist as new, not checked", async () => {
    const dir = await tempDir();
    const claim: Claim = { ...acmeCode, verdict: undefined };
    await writeClaims(dir, [claim]);
    const env = fakeEnv();
    const result = await audit(dir, env);
    expect(result.checks).toHaveLength(0);
    expect(result.worklist[0]?.reason).toBe("new");
  });

  test("ttl expiry marks the claim stale and lands it on the worklist as expired", async () => {
    const dir = await tempDir();
    const claim: Claim = { ...acmeCode, checked_at: "2026-01-01", ttl_days: 7 };
    await writeClaims(dir, [claim]);
    const env = fakeEnv();
    const result = await audit(dir, env);
    expect(result.freshness.stale.some((s) => s.reason === "ttl")).toBe(true);
    expect(result.worklist[0]?.reason).toBe("expired");
  });

  test("not_verified claims are skipped: no check, no worklist entry", async () => {
    const dir = await tempDir();
    const claim: Claim = { id: "C19", claim: "Which ID the lab record splits by.", status: "not_verified", owner: "Sam" };
    await writeClaims(dir, [claim]);
    const result = await audit(dir, fakeEnv());
    expect(result.checks).toHaveLength(0);
    expect(result.worklist).toHaveLength(0);
  });

  test("query evidence compares snow sql output against expect with tolerance", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "queries.sql"), "select count(*) from orders;");
    const claim: Claim = {
      id: "C12",
      claim: "918 people qualify once the last 7 days are excluded.",
      status: "verified",
      evidence: { kind: "query", sql: "queries.sql", expect: { rows: 1, value: 918, tolerance: 0 }, needs: "snow" },
      verdict: "supports",
      checked_by: "agent:claude",
      checked_at: "2026-09-20",
      ttl_days: 7,
    };
    await writeClaims(dir, [claim]);
    const env = fakeEnv({
      run: async (cmd) => {
        expect(cmd[0]).toBe("snow");
        return { code: 0, stdout: JSON.stringify([{ count: 918 }]), stderr: "" };
      },
    });
    const result = await audit(dir, env);
    expect(result.checks[0]?.ok).toBe(true);
  });

  test("link evidence checks status and excerpt via env.fetch", async () => {
    const dir = await tempDir();
    const claim: Claim = {
      id: "C20",
      claim: "The pricing page says self-serve starts at $40.",
      status: "verified",
      evidence: { kind: "link", url: "https://example.com/pricing", excerpt: "$40", needs: "http" },
      verdict: "supports",
      checked_by: "agent:claude",
      checked_at: "2026-09-20",
      ttl_days: 30,
    };
    await writeClaims(dir, [claim]);
    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve starts at $40/month." }) });
    const result = await audit(dir, env);
    expect(result.checks[0]?.ok).toBe(true);
  });

  test("record evidence extracts a dotted field and compares to expect", async () => {
    const dir = await tempDir();
    const claim: Claim = {
      id: "C21",
      claim: "The plan status is active.",
      status: "verified",
      evidence: { kind: "record", ref: "https://example.com/api/plan/1", field: "status.value", expect: "active", needs: "http" },
      verdict: "supports",
      checked_by: "agent:claude",
      checked_at: "2026-09-20",
      ttl_days: 30,
    };
    await writeClaims(dir, [claim]);
    const env = fakeEnv({ fetch: async () => ({ status: 200, body: JSON.stringify({ status: { value: "active" } }) }) });
    const result = await audit(dir, env);
    expect(result.checks[0]?.ok).toBe(true);
  });
});
