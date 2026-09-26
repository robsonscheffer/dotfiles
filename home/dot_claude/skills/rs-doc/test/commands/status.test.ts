import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { EXIT } from "../../src/types.ts";
import { fakeEnv, mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
async function tempDir(prefix: string): Promise<string> {
  const dir = await mkTmpDir(prefix);
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

describe("status command", () => {
  test("with a path: reports level and open claims with owners", async () => {
    const dir = await tempDir("mate-doc-status-cmd-");
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\nstatus: draft\n---\n\nBody. {C1}\n");
    writeFileSync(
      join(dir, "claims.yaml"),
      "claims:\n  - id: C1\n    claim: A fact.\n    status: not_verified\n    owner: Sam\n",
    );

    expect(await main(["status", dir], { env: fakeEnv() })).toBe(EXIT.ok);
  });

  test("with no path and no remembered folders: still exits ok", async () => {
    const stateDir = await tempDir("mate-doc-status-state-");
    process.env.MATE_DOC_STATE_DIR = stateDir;
    try {
      expect(await main(["status"], { env: fakeEnv() })).toBe(EXIT.ok);
    } finally {
      delete process.env.MATE_DOC_STATE_DIR;
    }
  });
});
