import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { runVerdict } from "../../src/commands/verdict.ts";
import { claimHash, loadLedger } from "../../src/ledger/index.ts";
import { EXIT } from "../../src/types.ts";
import { mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-verdict-");
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

const LEDGER_TEXT = `claims:
  - id: C1
    claim: The first claim, kept exactly as written.
    status: verified
    evidence:
      kind: link
      url: https://example.com/one
      excerpt: original excerpt
      needs: http
    ttl_days: 30
  - id: C2
    claim: The second claim, also kept exactly as written.
    status: not_verified
    owner: Sam
`;

const HUMAN_ALEX = { envVars: {}, isTTY: true, gitName: () => "Alex" };

async function setup(ledger = LEDGER_TEXT): Promise<{ dir: string; path: string }> {
  const dir = await tempDir();
  writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody. {C1}\n");
  writeFileSync(join(dir, "claims.yaml"), ledger);
  return { dir, path: join(dir, "claims.yaml") };
}

describe("verdict: round trip", () => {
  test("writes verdict, checked_by, checked_at into the target claim only", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody. {C1}\n");
    writeFileSync(join(dir, "claims.yaml"), LEDGER_TEXT);

    const code = await runVerdict([dir, "C1", "--supports"], HUMAN_ALEX);
    expect(code).toBe(EXIT.ok);

    const ledger = await loadLedger(dir);
    const c1 = ledger?.claims.find((c) => c.id === "C1");
    expect(c1?.verdict).toBe("supports");
    expect(c1?.checked_by).toBe("human:Alex");
    expect(c1?.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // C2 must be byte-for-byte untouched: same claim text, same owner, same status, no
    // verdict/checked_by/checked_at added to it.
    const c2 = ledger?.claims.find((c) => c.id === "C2");
    expect(c2).toEqual({
      id: "C2",
      claim: "The second claim, also kept exactly as written.",
      status: "not_verified",
      owner: "Sam",
    });

    const raw = readFileSync(join(dir, "claims.yaml"), "utf8");
    expect(raw).toContain("The first claim, kept exactly as written.");
    expect(raw).toContain("The second claim, also kept exactly as written.");
    expect(raw).toContain("owner: Sam");
  });

  test("--excerpt-file replaces the evidence excerpt for that claim only", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody. {C1}\n");
    writeFileSync(join(dir, "claims.yaml"), LEDGER_TEXT);
    const excerptFile = join(dir, "excerpt.txt");
    writeFileSync(excerptFile, "the real excerpt text\n");

    const code = await main([
      "verdict",
      dir,
      "C1",
      "--overstates",
      "--excerpt-file",
      excerptFile,
    ]);
    expect(code).toBe(EXIT.ok);

    const ledger = await loadLedger(dir);
    const c1 = ledger?.claims.find((c) => c.id === "C1");
    expect(c1?.verdict).toBe("overstates");
    expect((c1?.evidence as { excerpt?: string } | undefined)?.excerpt).toBe("the real excerpt text");
  });

  test("refuses an unknown claim id", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");
    writeFileSync(join(dir, "claims.yaml"), LEDGER_TEXT);

    expect(await main(["verdict", dir, "C99", "--supports"])).toBe(EXIT.usage);
  });

  test("requires one of the verdict flags", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");
    writeFileSync(join(dir, "claims.yaml"), LEDGER_TEXT);

    expect(await main(["verdict", dir, "C1"])).toBe(EXIT.usage);
  });
});

describe("verdict: who may say what", () => {
  test("--supports from an agent is refused and the file is untouched", async () => {
    const { dir, path } = await setup();
    const before = readFileSync(path, "utf8");
    const deps = { ...HUMAN_ALEX, envVars: { CLAUDECODE: "1" } };
    expect(await runVerdict([dir, "C1", "--supports"], deps)).toBe(EXIT.failed);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  test("--supports without a terminal is refused", async () => {
    const { dir, path } = await setup();
    const before = readFileSync(path, "utf8");
    expect(await runVerdict([dir, "C1", "--supports"], { ...HUMAN_ALEX, isTTY: false })).toBe(EXIT.failed);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  test("the author cannot support their own doc", async () => {
    const { dir, path } = await setup(`author: human:Sam\n${LEDGER_TEXT}`);
    const before = readFileSync(path, "utf8");
    const deps = { envVars: {}, isTTY: true, gitName: () => "Sam" };
    expect(await runVerdict([dir, "C1", "--supports"], deps)).toBe(EXIT.failed);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  test("--overstates from an agent writes agent:claude and a hash", async () => {
    const { dir } = await setup();
    const deps = { ...HUMAN_ALEX, envVars: { CLAUDECODE: "1" }, isTTY: false };
    expect(await runVerdict([dir, "C1", "--overstates"], deps)).toBe(EXIT.ok);
    const c1 = (await loadLedger(dir))!.claims.find((c) => c.id === "C1")!;
    expect(c1.checked_by).toBe("agent:claude");
    expect(c1.verdict).toBe("overstates");
    expect(c1.verdict_hash).toBe(claimHash(c1));
    expect(c1.status).toBe("proposed");
  });

  test("a human --supports with a reason writes status, reason, and hash", async () => {
    const { dir } = await setup();
    expect(await runVerdict([dir, "C1", "--supports", "--reason", "matches line 12: yes # ok"], HUMAN_ALEX)).toBe(EXIT.ok);
    const c1 = (await loadLedger(dir))!.claims.find((c) => c.id === "C1")!;
    expect(c1.checked_by).toBe("human:Alex");
    expect(c1.status).toBe("verified");
    expect(c1.verdict_reason).toBe("matches line 12: yes # ok");
    expect(c1.verdict_hash).toBe(claimHash(c1));
  });

  test("--uncheckable is accepted", async () => {
    const { dir } = await setup();
    expect(await runVerdict([dir, "C1", "--uncheckable"], HUMAN_ALEX)).toBe(EXIT.ok);
    expect((await loadLedger(dir))!.claims[0]!.verdict).toBe("uncheckable");
  });

  test("a second verdict replaces the reason instead of leaving a stale one", async () => {
    const { dir } = await setup();
    await runVerdict([dir, "C1", "--overstates", "--reason", "too strong"], HUMAN_ALEX);
    await runVerdict([dir, "C1", "--unrelated"], HUMAN_ALEX);
    const c1 = (await loadLedger(dir))!.claims[0]!;
    expect(c1.verdict).toBe("unrelated");
    expect(c1.verdict_reason).toBeUndefined();
  });
});

describe("verdict: flags", () => {
  test("--by is removed: usage error, file untouched", async () => {
    const { dir, path } = await setup();
    const before = readFileSync(path, "utf8");
    expect(await runVerdict([dir, "C1", "--overstates", "--by", "x"], HUMAN_ALEX)).toBe(EXIT.usage);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  test("--excerpt-file hashes the claim with the new excerpt", async () => {
    const { dir } = await setup();
    const excerptFile = join(dir, "excerpt.txt");
    writeFileSync(excerptFile, "the real excerpt text\n");
    expect(await runVerdict([dir, "C1", "--overstates", "--excerpt-file", excerptFile], HUMAN_ALEX)).toBe(EXIT.ok);
    const c1 = (await loadLedger(dir))!.claims[0]!;
    const expected = claimHash({
      claim: c1.claim,
      evidence: { kind: "link", url: "https://example.com/one", excerpt: "the real excerpt text", needs: "http" },
    });
    expect(c1.verdict_hash).toBe(expected);
  });

  test("verify without a path is a usage error", async () => {
    expect(await main(["verify"])).toBe(EXIT.usage);
  });
});
