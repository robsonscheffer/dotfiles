import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { EXIT } from "../../src/types.ts";
import { mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-lint-cmd-");
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

describe("lint command", () => {
  test("exits 0 on a clean page", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nA plain paragraph.\n");
    expect(await main(["lint", dir])).toBe(EXIT.ok);
  });

  test("exits 1 on an unresolved claim reference", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nA claim with no ledger. {C1}\n");
    expect(await main(["lint", dir])).toBe(EXIT.failed);
  });

  test("usage error when no path is given", async () => {
    expect(await main(["lint"])).toBe(EXIT.usage);
  });
});
