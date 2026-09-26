import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { addFolder, loadFolders } from "../../src/serve/state.ts";
import { mkTmpDir } from "./util.ts";

describe("serve: alias collisions", () => {
  test("appends -2 when two remembered folders share a basename", async () => {
    const stateDir = await mkTmpDir("mate-doc-alias-state-");
    const parentA = await mkTmpDir("mate-doc-alias-a-");
    const parentB = await mkTmpDir("mate-doc-alias-b-");
    const docsA = join(parentA, "docs");
    const docsB = join(parentB, "docs");
    await mkdir(docsA);
    await mkdir(docsB);
    await writeFile(join(docsA, "page.md"), "a");
    await writeFile(join(docsB, "page.md"), "b");

    const first = await addFolder(stateDir, docsA);
    const second = await addFolder(stateDir, docsB);

    expect(first.alias).toBe("docs");
    expect(second.alias).toBe("docs-2");

    const state = await loadFolders(stateDir);
    expect(state.folders.map((f) => f.alias)).toEqual(["docs", "docs-2"]);
  });

  test("adding the same folder twice reuses its alias", async () => {
    const stateDir = await mkTmpDir("mate-doc-alias-state-");
    const dir = await mkTmpDir("mate-doc-alias-same-");
    const first = await addFolder(stateDir, dir);
    const second = await addFolder(stateDir, dir);
    expect(second.alias).toBe(first.alias);
    const state = await loadFolders(stateDir);
    expect(state.folders.length).toBe(1);
  });
});
