import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { addFolder } from "../../src/serve/state.ts";
import { EXIT } from "../../src/types.ts";
import { mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
async function tempDir(prefix: string): Promise<string> {
  const dir = await mkTmpDir(prefix);
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
  delete process.env.MATE_DOC_STATE_DIR;
});

describe("forget command", () => {
  test("removes a remembered folder by alias", async () => {
    const stateDir = await tempDir("mate-doc-forget-state-");
    const served = await tempDir("mate-doc-forget-served-");
    writeFileSync(join(served, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");
    process.env.MATE_DOC_STATE_DIR = stateDir;

    const folder = await addFolder(stateDir, served);
    expect(await main(["forget", folder.alias])).toBe(EXIT.ok);
  });

  test("usage error when no folder is given", async () => {
    expect(await main(["forget"])).toBe(EXIT.usage);
  });
});
