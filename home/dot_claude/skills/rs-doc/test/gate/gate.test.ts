import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeApproval } from "../../src/commands/approve.ts";
import { gate } from "../../src/gate/index.ts";
import { ledgerHash } from "../../src/ledger/index.ts";
import { parse } from "../../src/parser/index.ts";
import type { Env, RunResult } from "../../src/types.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-gate-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    has: () => true,
    run: async (): Promise<RunResult> => ({ code: 0, stdout: "", stderr: "" }),
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-25T00:00:00Z"),
    ...overrides,
  };
}

const CLEAN_CLAIM = {
  id: "C1",
  claim: "Self-serve pricing starts at $40 a month.",
  status: "verified",
  evidence: { kind: "link", url: "https://example.com/pricing", excerpt: "$40", needs: "http" },
  verdict: "supports",
  checked_by: "agent:claude",
  checked_at: "2026-09-20",
  ttl_days: 30,
};

async function writePage(dir: string, frontmatterExtra = ""): Promise<void> {
  await writeFile(
    join(dir, "index.md"),
    `---\ntitle: Checkout\n${frontmatterExtra}---\n\nSelf-serve pricing starts at $40 a month. {C1}\n`,
  );
}
async function writeClaimsYaml(dir: string, claims: unknown[]): Promise<void> {
  await writeFile(join(dir, "claims.yaml"), `claims:\n${claims.map((c) => "  - " + JSON.stringify(c)).join("\n")}`);
}

// Every gate reason must be locatable: a non-empty file, and a real line number.
function expectFileLine(reasons: { path: string; pos?: { start: { line: number } } }[]): void {
  expect(reasons.length).toBeGreaterThan(0);
  for (const reason of reasons) {
    expect(reason.path.length).toBeGreaterThan(0);
    expect(reason.pos?.start.line).toBeGreaterThan(0);
  }
}

describe("gate: all green", () => {
  test("passes and promotes draft to audited", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [CLEAN_CLAIM]);
    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
    const result = await gate(dir, env);
    expect(result.pass).toBe(true);
    expect(result.levelBefore).toBe("draft");
    expect(result.levelAfter).toBe("audited");
    expect(result.reasons).toHaveLength(0);
    expect(result.summary.claims).toBe(1);
  });
});

describe("gate: one stale claim", () => {
  test("fails when ttl has elapsed, and stays draft", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [{ ...CLEAN_CLAIM, checked_at: "2026-01-01", ttl_days: 7 }]);
    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
    const result = await gate(dir, env);
    expect(result.pass).toBe(false);
    expect(result.levelAfter).toBe("draft");
    expect(result.summary.stale).toBeGreaterThan(0);
    expectFileLine(result.reasons);
  });
});

describe("gate: one missing verdict", () => {
  test("fails when a verified claim has no verdict yet", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [{ ...CLEAN_CLAIM, verdict: undefined }]);
    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
    const result = await gate(dir, env);
    expect(result.pass).toBe(false);
    expect(result.reasons.some((r) => r.claim === "C1" && r.kind === "no-verdict")).toBe(true);
    expectFileLine(result.reasons);
  });
});

describe("gate: capability missing", () => {
  test("a verified claim whose evidence needs a capability this environment does not have fails, with a locatable reason", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [CLEAN_CLAIM]);
    const env = fakeEnv({ has: () => false });
    const result = await gate(dir, env);
    expect(result.pass).toBe(false);
    expect(result.levelAfter).toBe("draft");
    const reason = result.reasons.find((r) => r.claim === "C1");
    expect(reason).toBeDefined();
    expect(reason?.kind).toBe("capability-missing");
    expectFileLine(result.reasons);
  });
});

describe("gate: one not_verified without owner", () => {
  test("fails", async () => {
    const dir = await tempDir();
    await writePage(dir, "");
    await writeFile(
      join(dir, "index.md"),
      "---\ntitle: Checkout\n---\n\nWhich ID the lab record splits by. {C2}\n",
    );
    await writeClaimsYaml(dir, [{ id: "C2", claim: "Which ID the lab record splits by.", status: "not_verified" }]);
    const result = await gate(dir, fakeEnv());
    expect(result.pass).toBe(false);
    expect(result.reasons.some((r) => r.kind === "no-owner")).toBe(true);
    expectFileLine(result.reasons);
  });

  test("passes when an owner is present", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, "index.md"),
      "---\ntitle: Checkout\n---\n\nWhich ID the lab record splits by. {C2}\n",
    );
    await writeClaimsYaml(dir, [{ id: "C2", claim: "Which ID the lab record splits by.", status: "not_verified", owner: "Sam" }]);
    const result = await gate(dir, fakeEnv());
    expect(result.pass).toBe(true);
  });
});

describe("gate: hash mismatch demotion", () => {
  test("demotes official to audited when the page changed but the doc still passes", async () => {
    const dir = await tempDir();
    await writeClaimsYaml(dir, [CLEAN_CLAIM]);
    await writeFile(
      join(dir, "index.md"),
      "---\ntitle: Checkout\nstatus: official\napproved_by: Sam\napproved_at: 2026-09-01\nledger_hash: stale-hash-does-not-match\n---\n\nSelf-serve pricing starts at $40 a month. {C1}\n",
    );
    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
    const result = await gate(dir, env);
    expect(result.levelBefore).toBe("official");
    expect(result.pass).toBe(true);
    expect(result.levelAfter).toBe("audited");
  });

  test("demotes official to draft when the page changed and the doc now fails", async () => {
    const dir = await tempDir();
    await writeClaimsYaml(dir, [{ ...CLEAN_CLAIM, verdict: undefined }]);
    await writeFile(
      join(dir, "index.md"),
      "---\ntitle: Checkout\nstatus: official\napproved_by: Sam\napproved_at: 2026-09-01\nledger_hash: stale-hash-does-not-match\n---\n\nSelf-serve pricing starts at $40 a month. {C1}\n",
    );
    const result = await gate(dir, fakeEnv());
    expect(result.levelBefore).toBe("official");
    expect(result.pass).toBe(false);
    expect(result.levelAfter).toBe("draft");
    expectFileLine(result.reasons);
  });
});

describe("gate: world staleness never changes level", () => {
  test("official stays official when the hash matches, even though the world went stale", async () => {
    const dir = await tempDir();
    const staleClaim = { ...CLEAN_CLAIM, checked_at: "2026-01-01", ttl_days: 7 };
    await writeClaimsYaml(dir, [staleClaim]);
    // ledgerHash strips position info and hashes by folder-relative path, so it no longer
    // matters that approving a doc grows the frontmatter block (shifting absolute positions):
    // the hash can be computed straight from a draft's content and stay valid once that same
    // content is re-parsed under a longer, official frontmatter block.
    const bodyOnly = "Self-serve pricing starts at $40 a month. {C1}\n";
    const draftPath = join(dir, "index.md");
    await writeFile(draftPath, `---\ntitle: Checkout\n---\n\n${bodyOnly}`);
    const docForHash = parse(await Bun.file(draftPath).text(), draftPath);
    const matchingHash = ledgerHash(
      [docForHash],
      { path: join(dir, "claims.yaml"), claims: [staleClaim as never] },
      dir,
    );
    await writeFile(
      draftPath,
      `---\ntitle: Checkout\nstatus: official\napproved_by: Sam\napproved_at: 2026-09-01\nledger_hash: ${matchingHash}\n---\n\n${bodyOnly}`,
    );
    const result = await gate(dir, fakeEnv());
    expect(result.levelBefore).toBe("official");
    expect(result.pass).toBe(false); // still reports the staleness as a failing reason
    expect(result.levelAfter).toBe("official"); // but the level itself does not move
    expectFileLine(result.reasons);
  });
});

describe("gate: approve, then gate, stays official", () => {
  test("the real approval write, followed by a real gate, keeps the doc official", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [CLEAN_CLAIM]);
    const env = fakeEnv({
      fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }),
      run: async () => ({ code: 0, stdout: "Sam\n", stderr: "" }),
    });

    // writeApproval is the same write runApprove does after its TTY/agent gate and y/N
    // prompt; exercised directly here since this is not an interactive test.
    await writeApproval(dir, true, env);
    const approvedText = await Bun.file(join(dir, "index.md")).text();
    expect(approvedText).toContain("status: official");

    const result = await gate(dir, env);
    expect(result.levelBefore).toBe("official");
    expect(result.pass).toBe(true);
    expect(result.levelAfter).toBe("official");
  });
});

describe("gate: a verdict that does not support", () => {
  test("fails with kind verdict-not-supports, distinct from no-verdict", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [{ ...CLEAN_CLAIM, verdict: "overstates" }]);
    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
    const result = await gate(dir, env);
    expect(result.pass).toBe(false);
    expect(result.reasons.some((r) => r.claim === "C1" && r.kind === "verdict-not-supports")).toBe(true);
    expectFileLine(result.reasons);
  });
});

describe("gate: folder mode lints every page, not only the primary one", () => {
  test("a lint error on a secondary page fails the gate", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [CLEAN_CLAIM]);
    // A second page in the same folder with an unresolved claim ref: a lint error that only
    // a full-folder scan (not a single primary-file loader) will ever see.
    await writeFile(join(dir, "extra.md"), "---\ntitle: Extra\n---\n\nAn extra claim. {C99}\n");
    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
    const result = await gate(dir, env);
    expect(result.pass).toBe(false);
    expect(result.reasons.some((r) => r.kind === "lint" && r.rule === "claim-unresolved")).toBe(true);
  });

  test("a single .md path only gates that page, ignoring lint errors on sibling pages", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [CLEAN_CLAIM]);
    await writeFile(join(dir, "extra.md"), "---\ntitle: Extra\n---\n\nAn extra claim. {C99}\n");
    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
    const result = await gate(join(dir, "index.md"), env);
    expect(result.pass).toBe(true);
  });
});
