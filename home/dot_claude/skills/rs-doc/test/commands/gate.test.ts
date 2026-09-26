import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { EXIT } from "../../src/types.ts";
import { fakeEnv, mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-gate-cmd-");
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

const CLEAN_CLAIM = `claims:
  - id: C1
    claim: Self-serve pricing starts at $40 a month.
    status: verified
    evidence:
      kind: link
      url: https://example.com/pricing
      excerpt: "$40"
      needs: http
    verdict: supports
    checked_by: agent:claude
    checked_at: "2026-09-20"
    ttl_days: 30
`;

describe("gate command: exit codes", () => {
  test("exits 0 and promotes draft to audited when the gate passes", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Checkout\n---\n\nSelf-serve pricing starts at $40 a month. {C1}\n");
    writeFileSync(join(dir, "claims.yaml"), CLEAN_CLAIM);

    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
    const code = await main(["gate", dir], { env });
    expect(code).toBe(EXIT.ok);

    const text = readFileSync(join(dir, "index.md"), "utf8");
    expect(text).toContain("status: audited");
  });

  test("exits 1 and leaves the level alone when the gate fails", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Checkout\n---\n\nSelf-serve pricing starts at $40 a month. {C1}\n");
    writeFileSync(join(dir, "claims.yaml"), CLEAN_CLAIM.replace("verdict: supports", "verdict: overstates"));

    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
    const code = await main(["gate", dir], { env });
    expect(code).toBe(EXIT.failed);

    const text = readFileSync(join(dir, "index.md"), "utf8");
    expect(text).not.toContain("status:");
  });

  test("writes the demotion when an official doc's hash no longer matches", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "claims.yaml"), CLEAN_CLAIM);
    writeFileSync(
      join(dir, "index.md"),
      "---\ntitle: Checkout\nstatus: official\napproved_by: Sam\napproved_at: 2026-09-01\nledger_hash: not-the-real-hash\n---\n\nSelf-serve pricing starts at $40 a month. {C1}\n",
    );

    const env = fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
    const code = await main(["gate", dir], { env });
    expect(code).toBe(EXIT.ok);

    const text = readFileSync(join(dir, "index.md"), "utf8");
    expect(text).toContain("status: audited");
    expect(text).toContain("approved_by: Sam"); // untouched fields survive the surgical write
  });

  test("usage error when no path is given", async () => {
    expect(await main(["gate"])).toBe(EXIT.usage);
  });
});

describe("gate command: a fresh shape skeleton's placeholder owner", () => {
  test("new --shape guide, then gate, fails on purpose: TODO is not a real owner", async () => {
    const dir = await tempDir();
    const target = join(dir, "guide");
    expect(await main(["new", target, "--shape", "guide"])).toBe(EXIT.ok);

    const env = fakeEnv();
    const code = await main(["gate", target], { env });
    expect(code).toBe(EXIT.failed);

    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await main(["gate", target], { env });
    } finally {
      process.stdout.write = originalWrite;
    }
    expect(chunks.join("")).toContain("placeholder, not a real owner");
  });
});
