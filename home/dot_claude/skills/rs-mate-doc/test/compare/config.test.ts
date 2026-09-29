import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_COMPARE_COMMAND,
  DEFAULT_CORE_FLAG,
  loadCompareCommand,
  loadCompareCoreFlag,
  splitCommand,
} from "../../src/compare/config.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-compare-config-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("splitCommand", () => {
  test("splits on whitespace", () => {
    expect(splitCommand("claude -p --bare")).toEqual(["claude", "-p", "--bare"]);
  });
});

describe("loadCompareCommand", () => {
  test("defaults to claude -p --safe-mode when no config file exists", async () => {
    const configDir = await tempDir();
    const command = await loadCompareCommand({ XDG_CONFIG_HOME: configDir });
    expect(command).toEqual(splitCommand(DEFAULT_COMPARE_COMMAND));
  });

  test("reads compare.command from config.yaml", async () => {
    const configDir = await tempDir();
    const dir = join(configDir, "mate-doc");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "config.yaml"), "compare:\n  command: codex exec --json\n");
    const command = await loadCompareCommand({ XDG_CONFIG_HOME: configDir });
    expect(command).toEqual(["codex", "exec", "--json"]);
  });

  test("falls back to default when compare key is missing", async () => {
    const configDir = await tempDir();
    const dir = join(configDir, "mate-doc");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "config.yaml"), "adapters: {}\n");
    const command = await loadCompareCommand({ XDG_CONFIG_HOME: configDir });
    expect(command).toEqual(splitCommand(DEFAULT_COMPARE_COMMAND));
  });
});

describe("loadCompareCoreFlag", () => {
  test("defaults to --append-system-prompt-file when no config file exists", async () => {
    const configDir = await tempDir();
    const flag = await loadCompareCoreFlag({ XDG_CONFIG_HOME: configDir });
    expect(flag).toBe(DEFAULT_CORE_FLAG);
  });

  test("reads compare.core_flag from config.yaml", async () => {
    const configDir = await tempDir();
    const dir = join(configDir, "mate-doc");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "config.yaml"),
      "compare:\n  command: codex exec --json\n  core_flag: --system-prompt-file\n",
    );
    const flag = await loadCompareCoreFlag({ XDG_CONFIG_HOME: configDir });
    expect(flag).toBe("--system-prompt-file");
  });
});
