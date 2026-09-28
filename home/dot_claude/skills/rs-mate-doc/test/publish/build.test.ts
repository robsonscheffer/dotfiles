import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import { buildDoc, resolveDoc } from "../../src/publish/build.ts";
import { listZipEntries } from "../../src/publish/zip.ts";
import { cleanupTempDirs, tempDir } from "./helpers.ts";

afterEach(cleanupTempDirs);

describe("resolveDoc + buildDoc", () => {
  test("a single markdown file builds as a page", async () => {
    const dir = await tempDir();
    const mdPath = join(dir, "page.md");
    await writeFile(mdPath, "---\ntitle: Page\n---\n\nHello.\n");
    const resolved = await resolveDoc(mdPath);
    expect(resolved.isFolder).toBe(false);
    const built = await buildDoc(resolved, null, parse, render);
    expect(built.kind).toBe("page");
    if (built.kind === "page") expect(built.html).toContain("Hello");
  });

  test("a folder zips every page and asset, rooted at index.html", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "index.md"), "---\ntitle: Home\n---\n\nWelcome.\n");
    await writeFile(join(dir, "notes.md"), "---\ntitle: Notes\n---\n\nMore.\n");
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "assets", "diagram.txt"), "not a real image, just an asset");
    await writeFile(join(dir, "claims.yaml"), "claims: []\n");

    const resolved = await resolveDoc(dir);
    expect(resolved.isFolder).toBe(true);
    const built = await buildDoc(resolved, null, parse, render);
    expect(built.kind).toBe("folder");
    if (built.kind !== "folder") throw new Error("expected folder");

    const entries = listZipEntries(built.zip).map((e) => e.name).sort();
    expect(entries).toContain("index.html");
    expect(entries).toContain("notes.html");
    expect(entries).toContain("assets/diagram.txt");
    // claims.yaml is ledger data, not a doc asset: it must never ship in the published zip.
    expect(entries).not.toContain("claims.yaml");
  });
});
