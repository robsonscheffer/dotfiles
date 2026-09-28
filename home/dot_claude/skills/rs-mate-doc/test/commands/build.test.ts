import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { EXIT } from "../../src/types.ts";
import { mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-build-");
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

describe("build: a plain page with no frontmatter", () => {
  test("produces self-contained HTML, no http resource URLs, next to the source file", async () => {
    const dir = await tempDir();
    const src = join(dir, "doc.md");
    writeFileSync(src, "Just a plain paragraph, no frontmatter at all.\n");

    expect(await main(["build", src])).toBe(EXIT.ok);

    const outPath = join(dir, "doc.html");
    const html = readFileSync(outPath, "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Just a plain paragraph");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });

  test("honors --out for a single file", async () => {
    const dir = await tempDir();
    const src = join(dir, "doc.md");
    writeFileSync(src, "Body.\n");
    const outDir = join(dir, "built");

    expect(await main(["build", src, "--out", outDir])).toBe(EXIT.ok);
    expect(readFileSync(join(outDir, "doc.html"), "utf8")).toContain("Body.");
  });
});

describe("build: a folder", () => {
  test("writes one html file per page into <path>/.build/ by default", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Landing\n---\n\nWelcome.\n");
    writeFileSync(join(dir, "other.md"), "---\ntitle: Other\n---\n\nMore.\n");

    expect(await main(["build", dir])).toBe(EXIT.ok);

    const indexHtml = readFileSync(join(dir, ".build", "index.html"), "utf8");
    const otherHtml = readFileSync(join(dir, ".build", "other.html"), "utf8");
    expect(indexHtml).toContain("Welcome.");
    expect(otherHtml).toContain("More.");
  });

  test("resolves a relative .md link to the built .html name", async () => {
    const dir = await tempDir();
    writeFileSync(join(dir, "index.md"), "---\ntitle: Landing\n---\n\nSee [Other](other.md) for more.\n");
    writeFileSync(join(dir, "other.md"), "---\ntitle: Other\n---\n\nMore.\n");

    expect(await main(["build", dir])).toBe(EXIT.ok);

    const indexHtml = readFileSync(join(dir, ".build", "index.html"), "utf8");
    expect(indexHtml).toContain('href="other.html"');
  });
});
