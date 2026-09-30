import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { runNew } from "../../src/commands/new.ts";
import { EXIT } from "../../src/types.ts";
import { fakeEnv, mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-new-");
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

describe("new: plain shape", () => {
  test("writes a single file with the plain skeleton", async () => {
    const dir = await tempDir();
    const target = join(dir, "doc.md");
    expect(await main(["new", target, "--shape", "plain"])).toBe(EXIT.ok);
    expect(existsSync(target)).toBe(true);
    const text = readFileSync(target, "utf8");
    expect(text).toContain("shape: plain");
  });

  test("refuses to overwrite an existing file", async () => {
    const dir = await tempDir();
    const target = join(dir, "doc.md");
    writeFileSync(target, "already here");
    expect(await main(["new", target, "--shape", "plain"])).toBe(EXIT.usage);
    expect(readFileSync(target, "utf8")).toBe("already here");
  });
});

describe("new: guide shape", () => {
  test("writes a folder with every guide page and a ledger", async () => {
    const dir = await tempDir();
    const target = join(dir, "guide");
    expect(await main(["new", target, "--shape", "guide"])).toBe(EXIT.ok);
    for (const name of ["index.md", "about-topic.md", "how-to-task.md", "reference.md", "claims.yaml"]) {
      expect(existsSync(join(target, name))).toBe(true);
    }
  });

  test("refuses to overwrite an existing folder", async () => {
    const dir = await tempDir();
    const target = join(dir, "guide");
    await main(["new", target, "--shape", "guide"]);
    expect(await main(["new", target, "--shape", "guide"])).toBe(EXIT.usage);
  });
});

describe("new: dashboard shape", () => {
  test("writes a folder with the dashboard skeleton", async () => {
    const dir = await tempDir();
    const target = join(dir, "dashboard");
    expect(await main(["new", target, "--shape", "dashboard"])).toBe(EXIT.ok);
    expect(existsSync(join(target, "index.md"))).toBe(true);
    const text = readFileSync(join(target, "index.md"), "utf8");
    expect(text).toContain("shape: dashboard");
  });

  test("refuses to overwrite an existing folder", async () => {
    const dir = await tempDir();
    const target = join(dir, "dashboard");
    await main(["new", target, "--shape", "dashboard"]);
    expect(await main(["new", target, "--shape", "dashboard"])).toBe(EXIT.usage);
  });
});

describe("new: unbuildable shapes", () => {
  test("--shape walk points at the walk command instead of building anything", async () => {
    const dir = await tempDir();
    const target = join(dir, "walked.md");
    expect(await main(["new", target, "--shape", "walk"])).toBe(EXIT.usage);
    expect(existsSync(target)).toBe(false);
  });

  test("an unknown shape is a usage error", async () => {
    const dir = await tempDir();
    const target = join(dir, "doc.md");
    expect(await main(["new", target, "--shape", "mystery"])).toBe(EXIT.usage);
  });
});

const savedEnv: Record<string, string | undefined> = {};
const ACTOR_VARS = ["CLAUDECODE", "CODEX_SANDBOX", "MATE_DOC_AGENT"];
beforeEach(() => {
  for (const v of ACTOR_VARS) {
    savedEnv[v] = process.env[v];
    delete process.env[v];
  }
});
afterEach(() => {
  for (const v of ACTOR_VARS) {
    if (savedEnv[v] === undefined) delete process.env[v];
    else process.env[v] = savedEnv[v];
  }
});

describe("new: ledger author", () => {
  test("a human run writes author: human:<git name>", async () => {
    const dir = await tempDir();
    const target = join(dir, "brief");
    expect(await runNew([target, "--shape", "brief"], () => "Alex")).toBe(EXIT.ok);
    const text = readFileSync(join(target, "claims.yaml"), "utf8");
    expect(text.split("\n")[0]).toBe("author: human:Alex");
    expect(text).toContain("owner: \"TODO: who to ask\"");
  });

  test("an agent run writes author: agent:claude", async () => {
    process.env.CLAUDECODE = "1";
    const dir = await tempDir();
    const target = join(dir, "guide");
    expect(await main(["new", target, "--shape", "guide"])).toBe(EXIT.ok);
    expect(readFileSync(join(target, "claims.yaml"), "utf8").split("\n")[0]).toBe("author: agent:claude");
  });

  test("new then gate reports no no-author, only the TODO owner", async () => {
    process.env.CLAUDECODE = "1";
    const dir = await tempDir();
    const target = join(dir, "brief");
    await main(["new", target, "--shape", "brief"]);
    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    let code: number;
    try {
      code = await main(["gate", target], { env: fakeEnv() });
    } finally {
      process.stdout.write = originalWrite;
    }
    expect(code).toBe(EXIT.failed);
    const out = chunks.join("");
    expect(out).not.toContain("no author");
    expect(out).toContain("placeholder, not a real owner");
  });
});
