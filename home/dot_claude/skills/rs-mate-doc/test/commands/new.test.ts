import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { EXIT } from "../../src/types.ts";
import { mkTmpDir, rmTmpDir } from "./util.ts";

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
