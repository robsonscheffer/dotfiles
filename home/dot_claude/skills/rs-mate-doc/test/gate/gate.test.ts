import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeApproval } from "../../src/commands/approve.ts";
import { gate } from "../../src/gate/index.ts";
import { claimHash, ledgerHash } from "../../src/ledger/index.ts";
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

const CLEAN_BASE = {
  claim: "Self-serve pricing starts at $40 a month.",
  evidence: { kind: "link", url: "https://example.com/pricing", excerpt: "starts at $40", needs: "http" },
} as const;
const CLEAN_CLAIM = {
  id: "C1",
  ...CLEAN_BASE,
  status: "verified",
  verdict: "supports",
  verdict_hash: claimHash(CLEAN_BASE as never),
  checked_by: "verifier:fixture",
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
  await writeFile(join(dir, "claims.yaml"), `author: agent:claude\nclaims:\n${claims.map((c) => "  - " + JSON.stringify(c)).join("\n")}`);
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

describe("gate: summary.open counts not_verified claims, same as status", () => {
  test("a not_verified claim with a real owner is open even though it isn't a gate failure", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, "index.md"),
      "---\ntitle: Checkout\n---\n\nWhich ID the lab record splits by. {C2}\n",
    );
    await writeClaimsYaml(dir, [
      { id: "C2", claim: "Which ID the lab record splits by.", status: "not_verified", owner: "Sam" },
    ]);
    const result = await gate(dir, fakeEnv());
    expect(result.pass).toBe(true); // a real owner is not a gate failure
    expect(result.summary.open).toBe(1); // but it is still an open claim
  });

  test("a placeholder TODO owner fails the gate and is still counted as open", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, "index.md"),
      "---\ntitle: Checkout\n---\n\nWhich ID the lab record splits by. {C2}\n",
    );
    await writeClaimsYaml(dir, [
      { id: "C2", claim: "Which ID the lab record splits by.", status: "not_verified", owner: "TODO: who to ask" },
    ]);
    const result = await gate(dir, fakeEnv());
    expect(result.pass).toBe(false);
    expect(result.reasons.some((r) => r.kind === "no-owner" && r.claim === "C2")).toBe(true);
    expect(result.summary.open).toBe(1);
  });
});

const PRICING_ENV = () =>
  fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });

async function writeLedgerRaw(dir: string, authorLine: string, claims: unknown[]): Promise<void> {
  await writeFile(
    join(dir, "claims.yaml"),
    `${authorLine}claims:\n${claims.map((c) => "  - " + JSON.stringify(c)).join("\n")}`,
  );
}

function kindsOf(result: { reasons: { kind: string }[] }): string[] {
  return result.reasons.map((r) => r.kind);
}

describe("gate: no-author", () => {
  test("a ledger with no author fails once with no-author", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeLedgerRaw(dir, "", [CLEAN_CLAIM, { ...CLEAN_CLAIM, id: "C2" }]);
    const result = await gate(dir, PRICING_ENV());
    expect(result.pass).toBe(false);
    expect(kindsOf(result).filter((k) => k === "no-author")).toHaveLength(1);
    expectFileLine(result.reasons);
  });

  test("a TODO author fails once with no-author", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeLedgerRaw(dir, 'author: "TODO: set by mate-doc new"\n', [CLEAN_CLAIM]);
    const result = await gate(dir, PRICING_ENV());
    expect(kindsOf(result).filter((k) => k === "no-author")).toHaveLength(1);
  });
});

describe("gate: verdict-not-independent", () => {
  test("a supports verdict by agent:claude fails", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [{ ...CLEAN_CLAIM, checked_by: "agent:claude" }]);
    const result = await gate(dir, PRICING_ENV());
    expect(result.reasons.some((r) => r.claim === "C1" && r.kind === "verdict-not-independent")).toBe(true);
    expectFileLine(result.reasons);
  });

  test("a human verdict by the ledger author fails", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeLedgerRaw(dir, "author: human:Sam\n", [{ ...CLEAN_CLAIM, checked_by: "human:Sam" }]);
    const result = await gate(dir, PRICING_ENV());
    expect(kindsOf(result)).toEqual(["verdict-not-independent"]);
  });

  test("a missing checked_by fails", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [{ ...CLEAN_CLAIM, checked_by: undefined }]);
    const result = await gate(dir, PRICING_ENV());
    expect(kindsOf(result)).toContain("verdict-not-independent");
  });
});

describe("gate: verdict-stale", () => {
  test("changing the claim text after the verdict fails", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [{ ...CLEAN_CLAIM, claim: "Self-serve pricing starts at $50 a month." }]);
    const result = await gate(dir, PRICING_ENV());
    expect(result.reasons.some((r) => r.claim === "C1" && r.kind === "verdict-stale")).toBe(true);
  });

  test("changing the excerpt after the verdict fails", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [
      { ...CLEAN_CLAIM, evidence: { ...CLEAN_CLAIM.evidence, excerpt: "starts at $45" } },
    ]);
    const result = await gate(dir, PRICING_ENV());
    expect(kindsOf(result)).toContain("verdict-stale");
  });

  test("a missing verdict_hash fails", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [{ ...CLEAN_CLAIM, verdict_hash: undefined }]);
    const result = await gate(dir, PRICING_ENV());
    expect(kindsOf(result)).toContain("verdict-stale");
    expect(kindsOf(result)).not.toContain("claim-incomplete");
  });
});

describe("gate: mcp-needs-human", () => {
  const mcpBase = {
    claim: "The orders team agreed to keep the label rule.",
    evidence: {
      kind: "mcp",
      source: "https://chat.example.test/archives/C000/p1700000000",
      excerpt: "Agreed, we keep it.",
      needs: "mcp:slack",
    },
  };
  const mcpClaim = (checkedBy: string) => ({
    id: "C1",
    ...mcpBase,
    status: "verified",
    verdict: "supports",
    verdict_hash: claimHash(mcpBase as never),
    checked_by: checkedBy,
    checked_at: "2026-09-20",
    ttl_days: 30,
  });

  test("a verifier verdict on mcp evidence fails", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [mcpClaim("verifier:x")]);
    const result = await gate(dir, fakeEnv());
    expect(kindsOf(result)).toEqual(["mcp-needs-human"]);
  });

  test("a human verdict passes and no check is run", async () => {
    const dir = await tempDir();
    await writePage(dir);
    await writeClaimsYaml(dir, [mcpClaim("human:Sam")]);
    let ran = 0;
    const env = fakeEnv({
      run: async () => {
        ran++;
        return { code: 0, stdout: "", stderr: "" };
      },
      fetch: async () => {
        ran++;
        return { status: 200, body: "" };
      },
    });
    const result = await gate(dir, env);
    expect(result.pass).toBe(true);
    expect(ran).toBe(0);
  });
});

describe("gate: reason order", () => {
  test("a claim with two problems reports only the first", async () => {
    const dir = await tempDir();
    await writePage(dir);
    // Both not independent and stale: independence comes first.
    await writeClaimsYaml(dir, [{ ...CLEAN_CLAIM, checked_by: "agent:claude", claim: "Changed text here." }]);
    const result = await gate(dir, PRICING_ENV());
    const claimKinds = result.reasons.filter((r) => r.claim === "C1").map((r) => r.kind);
    expect(claimKinds).toEqual(["verdict-not-independent"]);
  });
});

describe("gate: official demotion on integrity failure", () => {
  test("an official doc with a matching hash and an agent verdict drops to draft", async () => {
    const dir = await tempDir();
    const claim = { ...CLEAN_CLAIM, checked_by: "agent:claude" };
    await writeClaimsYaml(dir, [claim]);
    const bodyOnly = "Self-serve pricing starts at $40 a month. {C1}\n";
    const path = join(dir, "index.md");
    await writeFile(path, `---\ntitle: Checkout\n---\n\n${bodyOnly}`);
    const docForHash = parse(await Bun.file(path).text(), path);
    const hash = ledgerHash([docForHash], { path: join(dir, "claims.yaml"), author: "agent:claude", claims: [claim as never] }, dir);
    await writeFile(path, `---\ntitle: Checkout\nstatus: official\napproved_by: Sam\nledger_hash: ${hash}\n---\n\n${bodyOnly}`);
    const result = await gate(dir, PRICING_ENV());
    expect(result.levelBefore).toBe("official");
    expect(result.levelAfter).toBe("draft");
    expect(kindsOf(result)).toContain("verdict-not-independent");
  });
});

describe("gate: summary.verified", () => {
  test("counts only verified claims with no reason in this run", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, "index.md"),
      "---\ntitle: Checkout\n---\n\nSelf-serve pricing starts at $40 a month. {C1} Also this. {C2}\n",
    );
    await writeClaimsYaml(dir, [CLEAN_CLAIM, { ...CLEAN_CLAIM, id: "C2", verdict_hash: "stale" }]);
    const result = await gate(dir, PRICING_ENV());
    expect(result.summary.claims).toBe(2);
    expect(result.summary.verified).toBe(1);
  });
});
