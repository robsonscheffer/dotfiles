import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { EXIT } from "../../src/types.ts";
import { fakeEnv, mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-approve-");
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

const savedEnv: Record<string, string | undefined> = {};
const AGENT_VARS = ["CLAUDECODE", "CODEX_SANDBOX", "MATE_DOC_AGENT"];
beforeEach(() => {
  for (const v of AGENT_VARS) savedEnv[v] = process.env[v];
});
afterEach(() => {
  for (const v of AGENT_VARS) {
    if (savedEnv[v] === undefined) delete process.env[v];
    else process.env[v] = savedEnv[v];
  }
});

describe("approve: human only", () => {
  test("refuses when stdin is not a TTY (the case in this test run)", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");

    const code = await main(["approve", dir], { env: fakeEnv() });
    expect(code).toBe(EXIT.failed);
  });

  test("refuses when CLAUDECODE is set, regardless of anything else", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");
    process.env.CLAUDECODE = "1";

    const code = await main(["approve", dir], { env: fakeEnv() });
    expect(code).toBe(EXIT.failed);
  });

  test("refuses when CODEX_SANDBOX is set", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");
    process.env.CODEX_SANDBOX = "1";

    expect(await main(["approve", dir], { env: fakeEnv() })).toBe(EXIT.failed);
  });

  test("refuses when MATE_DOC_AGENT is set", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");
    process.env.MATE_DOC_AGENT = "1";

    expect(await main(["approve", dir], { env: fakeEnv() })).toBe(EXIT.failed);
  });

  test("usage error when no path is given", async () => {
    expect(await main(["approve"])).toBe(EXIT.usage);
  });
});
