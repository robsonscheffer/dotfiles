import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { EXIT } from "../../src/types.ts";
import { fakeEnv, mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-audit-cmd-");
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

describe("audit command", () => {
  test("--json prints the full AuditResult", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody. {C1}\n");
    writeFileSync(
      join(dir, "claims.yaml"),
      "claims:\n  - id: C1\n    claim: A fact.\n    status: not_verified\n    owner: Sam\n",
    );

    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    let code: number;
    try {
      code = await main(["audit", dir, "--json"], { env: fakeEnv() });
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(code).toBe(EXIT.ok);
    const parsed = JSON.parse(chunks.join(""));
    expect(parsed.docDir).toBe(dir);
    expect(Array.isArray(parsed.worklist)).toBe(true);
  });

  test("usage error when no path is given", async () => {
    expect(await main(["audit"])).toBe(EXIT.usage);
  });
});
