import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_COMPARE_COMMAND,
  DEFAULT_CORE_FLAG,
  loadCompareCommand,
  loadCompareConfig,
  loadCompareCoreFlag,
  splitCommand,
} from "../../src/compare/config.ts";
import type { CompareConfig } from "../../src/compare/types.ts";

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

async function writeConfig(yaml: string): Promise<string> {
  const configDir = await tempDir();
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(configDir, "mate-doc"), { recursive: true });
  await writeFile(join(configDir, "mate-doc", "config.yaml"), yaml);
  return configDir;
}

describe("loadCompareConfig", () => {
  const defaults: CompareConfig = {
    command: ["claude", "--permission-mode", "bypassPermissions"],
    systemFlag: "--append-system-prompt-file",
    isolateFlags: ["--setting-sources", "project,local"],
    checks: [
      { name: "words", kind: "words" },
      { name: "em-dashes", kind: "count", pattern: "\u2014" },
    ],
  };

  test("returns defaults with no file", async () => {
    const configDir = await tempDir();
    expect(await loadCompareConfig({ XDG_CONFIG_HOME: configDir })).toEqual(defaults);
  });

  test("returns defaults when compare key is missing", async () => {
    const configDir = await writeConfig("adapters: {}\n");
    expect(await loadCompareConfig({ XDG_CONFIG_HOME: configDir })).toEqual(defaults);
  });

  test("overrides command", async () => {
    const configDir = await writeConfig("compare:\n  command: codex exec\n");
    const cfg = await loadCompareConfig({ XDG_CONFIG_HOME: configDir });
    expect(cfg.command).toEqual(["codex", "exec"]);
    expect(cfg.systemFlag).toBe(defaults.systemFlag);
  });

  test("overrides system_flag", async () => {
    const configDir = await writeConfig("compare:\n  system_flag: --system-file\n");
    expect((await loadCompareConfig({ XDG_CONFIG_HOME: configDir })).systemFlag).toBe("--system-file");
  });

  test("overrides isolate_flags", async () => {
    const configDir = await writeConfig("compare:\n  isolate_flags: --bare --no-hooks\n");
    expect((await loadCompareConfig({ XDG_CONFIG_HOME: configDir })).isolateFlags).toEqual(["--bare", "--no-hooks"]);
  });

  test("overrides checks and drops bad entries", async () => {
    const configDir = await writeConfig(
      [
        "compare:",
        "  checks:",
        "    - {name: short, kind: words, max: 120}",
        "    - {name: hedges, kind: phrases, list: [perhaps, maybe]}",
        "    - {name: wall, kind: long_paragraphs, max_lines: 5}",
        "    - {name: ask, kind: ends_with, pattern: '\\?$'}",
        "    - {name: bad-kind, kind: sentiment}",
        "    - {name: no-pattern, kind: count}",
        "    - {kind: words}",
        "    - {name: bad-list, kind: phrases, list: [1, 2]}",
        "",
      ].join("\n"),
    );
    const cfg = await loadCompareConfig({ XDG_CONFIG_HOME: configDir });
    expect(cfg.checks).toEqual([
      { name: "short", kind: "words", max: 120 },
      { name: "hedges", kind: "phrases", list: ["perhaps", "maybe"] },
      { name: "wall", kind: "long_paragraphs", max_lines: 5 },
      { name: "ask", kind: "ends_with", pattern: "\\?$" },
    ]);
  });

  test("falls back to default checks when every entry is bad", async () => {
    const configDir = await writeConfig("compare:\n  checks:\n    - {name: x, kind: nope}\n");
    expect((await loadCompareConfig({ XDG_CONFIG_HOME: configDir })).checks).toEqual(defaults.checks);
  });
});
