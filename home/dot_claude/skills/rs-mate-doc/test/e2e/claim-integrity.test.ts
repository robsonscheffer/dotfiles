// End to end: the author proposes, `verify` judges with a fake agent, the gate decides.
// Synthetic data only (acme/widgets, Alex, Sam, ABC-12). No real `claude` is ever spawned.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runVerify } from "../../src/commands/verify.ts";
import { gate } from "../../src/gate/index.ts";
import { claimHash, loadLedger } from "../../src/ledger/index.ts";
import { lint } from "../../src/lint/index.ts";
import { parse } from "../../src/parser/index.ts";
import { EXIT, type Env, type RunResult } from "../../src/types.ts";
import { composeWalk } from "../../src/walk/compose.ts";
import type { FetchedPr, WalkInputs } from "../../src/walk/types.ts";
import { WALK_INPUTS } from "../walk/fixture.ts";
import { mkTmpDir, rmTmpDir } from "../commands/util.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-e2e-");
  dirs.push(dir);
  return dir;
}
const savedXdg = process.env.XDG_CONFIG_HOME;
beforeEach(async () => {
  process.env.XDG_CONFIG_HOME = await tempDir();
});
afterEach(async () => {
  if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = savedXdg;
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

const RETRY_LINE = "const RETRY_DELAY_SECONDS = 30;";
const FILE_AT_REV = ["// retry.ts", "export const MAX_TRIES = 5;", RETRY_LINE, "export const JITTER = 0.2;", ""].join("\n");
const SENTENCE = "The retry helper waits 30 seconds between attempts.";
const REF = "acme/widgets@main:src/retry.ts:3";

function agentAnswer(verdict: string, quote: string): RunResult {
  return {
    code: 0,
    stdout: JSON.stringify({
      structured_output: { verdict, reason: "The line sets the delay.", quote },
      modelUsage: { "claude-sonnet-x": {} },
    }),
    stderr: "",
  };
}

interface Fake {
  env: Env;
  agentCalls: number;
}

// Answers the repo fetch (gh api contents) and the agent call. Anything else is a test bug.
function fakeEnv(files: Record<string, string>, agent: RunResult): Fake {
  const fake: Fake = { agentCalls: 0, env: undefined as unknown as Env };
  fake.env = {
    has: () => true,
    fetch: async () => ({ status: 404, body: "" }),
    now: () => new Date("2026-09-30T12:00:00Z"),
    run: async (cmd): Promise<RunResult> => {
      if (cmd[0] === "gh" && cmd[1] === "api") {
        const m = /^repos\/[^/]+\/[^/]+\/contents\/(.+)\?ref=(.+)$/.exec(cmd[2] ?? "");
        const content = m ? files[`${m[2]}:${m[1]}`] : undefined;
        if (content === undefined) return { code: 1, stdout: "", stderr: `no fixture for ${cmd[2]}` };
        return { code: 0, stdout: JSON.stringify({ content: Buffer.from(content).toString("base64"), encoding: "base64" }), stderr: "" };
      }
      if (cmd[0] === "git") return { code: 1, stdout: "", stderr: "no local checkout" };
      if (cmd.includes("--json-schema")) {
        fake.agentCalls++;
        return agent;
      }
      throw new Error(`unexpected command: ${cmd.join(" ")}`);
    },
  };
  return fake;
}

function ledger(claimBody: string, author = "human:Alex"): string {
  return `author: ${author}\nclaims:\n${claimBody}`;
}

const EVIDENCE = `    evidence:
      kind: code
      ref: ${REF}
      excerpt: "${RETRY_LINE}"
      needs: gh
    ttl_days: 30
`;

const PROPOSED = `  - id: C1
    claim: ${SENTENCE}
    status: proposed
${EVIDENCE}`;

async function writeDoc(dir: string, claimsYaml: string, sentence = SENTENCE): Promise<void> {
  await writeFile(join(dir, "index.md"), `---\ntitle: Retry notes\n---\n\n# Retry notes\n\n${sentence} {C1}\n`);
  await writeFile(join(dir, "claims.yaml"), claimsYaml);
}

async function lintIssues(dir: string) {
  const doc = parse(await readFile(join(dir, "index.md"), "utf8"), join(dir, "index.md"));
  return lint([doc], await loadLedger(dir));
}

describe("claim integrity, end to end", () => {
  test("an author-written verified claim with checked_by agent fails the gate as not independent", async () => {
    const dir = await tempDir();
    const hash = claimHash({ claim: SENTENCE, evidence: { kind: "code", ref: REF, excerpt: RETRY_LINE, needs: "gh" } });
    await writeDoc(
      dir,
      ledger(`  - id: C1
    claim: ${SENTENCE}
    status: verified
${EVIDENCE}    verdict: supports
    checked_by: agent:claude
    checked_at: "2026-09-30"
    verdict_hash: ${hash}
`),
    );
    const fake = fakeEnv({ "main:src/retry.ts": FILE_AT_REV }, agentAnswer("supports", RETRY_LINE));
    const result = await gate(dir, fake.env);
    expect(result.pass).toBe(false);
    expect(result.reasons.map((r) => r.kind)).toContain("verdict-not-independent");
    expect(fake.agentCalls).toBe(0);
  });

  test("proposed then verify with a supports quote in the window passes the gate", async () => {
    const dir = await tempDir();
    await writeDoc(dir, ledger(PROPOSED));
    const fake = fakeEnv({ "main:src/retry.ts": FILE_AT_REV }, agentAnswer("supports", RETRY_LINE));

    expect(await runVerify([dir], fake.env)).toBe(EXIT.ok);
    expect(fake.agentCalls).toBe(1);

    const claim = (await loadLedger(dir))!.claims[0]!;
    expect(claim.status).toBe("verified");
    expect(claim.verdict).toBe("supports");
    expect(claim.checked_by).toBe("verifier:claude-sonnet-x");
    expect(claim.verdict_hash).toBeTruthy();

    const result = await gate(dir, fake.env);
    expect(result.reasons).toEqual([]);
    expect(result.pass).toBe(true);
  });

  test("editing the claim after its verdict fails the gate as stale", async () => {
    const dir = await tempDir();
    await writeDoc(dir, ledger(PROPOSED));
    const fake = fakeEnv({ "main:src/retry.ts": FILE_AT_REV }, agentAnswer("supports", RETRY_LINE));
    expect(await runVerify([dir], fake.env)).toBe(EXIT.ok);

    const edited = "The retry helper waits 60 seconds between attempts.";
    const raw = await readFile(join(dir, "claims.yaml"), "utf8");
    await writeFile(join(dir, "claims.yaml"), raw.replace(SENTENCE, edited));
    await writeFile(join(dir, "index.md"), `---\ntitle: Retry notes\n---\n\n# Retry notes\n\n${edited} {C1}\n`);

    const result = await gate(dir, fake.env);
    expect(result.pass).toBe(false);
    expect(result.reasons.map((r) => r.kind)).toContain("verdict-stale");
  });

  test("a supports whose quote is not in the window writes nothing", async () => {
    const dir = await tempDir();
    await writeDoc(dir, ledger(PROPOSED));
    const before = await readFile(join(dir, "claims.yaml"), "utf8");
    const fake = fakeEnv({ "main:src/retry.ts": FILE_AT_REV }, agentAnswer("supports", "const RETRY_DELAY_SECONDS = 99;"));

    expect(await runVerify([dir], fake.env)).toBe(EXIT.failed);
    expect(fake.agentCalls).toBe(1);
    expect(await readFile(join(dir, "claims.yaml"), "utf8")).toBe(before);
  });

  test("a claim that reads as an instruction fails lint with claim-is-instruction", async () => {
    const dir = await tempDir();
    const sentence = "Read this first: the retry file";
    await writeDoc(dir, ledger(PROPOSED.replace(SENTENCE, `"${sentence}"`)), sentence);
    const issues = await lintIssues(dir);
    expect(issues.some((i) => i.rule === "claim-is-instruction" && i.claim === "C1")).toBe(true);
  });

  test("a composed walk goes through lint, verify and the gate", async () => {
    const dir = await tempDir();
    const sha = "9c1f3a7d2e4b6c8091a2b3c4d5e6f7081920a3b4";
    const added = "const RETRY_DELAY_SECONDS = 30;";
    const diff = [
      "diff --git a/src/retry.ts b/src/retry.ts",
      "index 8f2a1c4..b93e017 100644",
      "--- a/src/retry.ts",
      "+++ b/src/retry.ts",
      "@@ -1,3 +1,4 @@",
      " // retry.ts",
      " export const MAX_TRIES = 5;",
      `+${added}`,
      " export const JITTER = 0.2;",
      "",
    ].join("\n");
    const pr: FetchedPr = {
      repo: "acme/widgets",
      meta: {
        number: 12,
        title: "feat(retry): add a fixed retry delay (ABC-12)",
        author: { login: "sam" },
        headRefName: "sam/retry-delay",
        headRefOid: sha,
        baseRefName: "main",
        baseRefOid: "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d",
        additions: 1,
        deletions: 0,
        changedFiles: 1,
        url: "https://github.com/acme/widgets/pull/12",
      },
      body: "Adds a fixed retry delay.",
      diff,
      files: ["src/retry.ts"],
    };
    const inputs: WalkInputs = {
      story: {
        lead: "Adds a fixed retry delay.",
        story: ["The retry helper had no delay between attempts."],
        groups: [
          {
            title: "The delay constant",
            framing: SENTENCE,
            anchors: [{ file: "src/retry.ts", excerpt: added }],
            files: ["src/retry.ts"],
          },
        ],
      },
      questions: [{ title: "Backoff", question: "Should the delay grow with each attempt?", pointer: "src/retry.ts" }],
      risks: [{ title: "Latency", description: "Callers wait longer on failure.", blast_radius: "retry callers", file: "src/retry.ts" }],
      judgment: WALK_INPUTS.judgment,
    };

    const composed = composeWalk(pr, inputs, { author: "human:Alex", now: new Date("2026-09-30T12:00:00Z") });
    for (const [name, text] of Object.entries(composed.files)) await writeFile(join(dir, name), text);

    const errors = (await lintIssues(dir)).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);

    const fake = fakeEnv({ [`${sha}:src/retry.ts`]: FILE_AT_REV }, agentAnswer("supports", added));
    expect(await runVerify([dir], fake.env)).toBe(EXIT.ok);
    const result = await gate(dir, fake.env);
    expect(result.reasons).toEqual([]);
    expect(result.pass).toBe(true);
  });
});
