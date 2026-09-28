import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { loadLedger } from "../../src/ledger/index.ts";
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

describe("verdict: round trip", () => {
  test("writes verdict, checked_by, checked_at into the target claim only", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody. {C1}\n");
    writeFileSync(join(dir, "claims.yaml"), LEDGER_TEXT);

    const code = await main(["verdict", dir, "C1", "--supports", "--by", "Alex"]);
    expect(code).toBe(EXIT.ok);

    const ledger = await loadLedger(dir);
    const c1 = ledger?.claims.find((c) => c.id === "C1");
    expect(c1?.verdict).toBe("supports");
    expect(c1?.checked_by).toBe("Alex");
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
