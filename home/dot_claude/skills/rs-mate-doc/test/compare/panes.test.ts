import { describe, expect, test } from "bun:test";
import { paneCommands } from "../../src/compare/panes.ts";
import { PANES, lowerIsBetter, type CompareConfig } from "../../src/compare/types.ts";

const cfg: CompareConfig = {
  command: ["claude", "--permission-mode", "bypassPermissions"],
  systemFlag: "--append-system-prompt-file",
  isolateFlags: ["--setting-sources", "project,local"],
  checks: [],
};
const opts = { basePath: "/tmp/base.md", bPath: "/tmp/candidate.md" };

describe("paneCommands", () => {
  test("returns three panes in PANES order", () => {
    expect(paneCommands(cfg, opts).map((p) => p.name)).toEqual([...PANES]);
  });

  test("builds argv without --model", () => {
    const [a, base, b] = paneCommands(cfg, opts);
    expect(a!.argv).toEqual(["claude", "--permission-mode", "bypassPermissions"]);
    expect(base!.argv).toEqual([
      "claude", "--permission-mode", "bypassPermissions",
      "--setting-sources", "project,local",
      "--append-system-prompt-file", "/tmp/base.md",
    ]);
    expect(b!.argv).toEqual([
      "claude", "--permission-mode", "bypassPermissions",
      "--setting-sources", "project,local",
      "--append-system-prompt-file", "/tmp/candidate.md",
    ]);
  });

  test("appends --model to every pane", () => {
    for (const pane of paneCommands(cfg, { ...opts, model: "sonnet" })) {
      expect(pane.argv.slice(-2)).toEqual(["--model", "sonnet"]);
    }
  });

  test("A has no isolate flags and no system flag", () => {
    const a = paneCommands(cfg, opts)[0]!;
    expect(a.argv).not.toContain("--setting-sources");
    expect(a.argv).not.toContain(cfg.systemFlag);
  });

  test("A-base and B differ only at the path position", () => {
    const [, base, b] = paneCommands(cfg, { ...opts, model: "sonnet" });
    const diffs = base!.argv.map((v, i) => (v === b!.argv[i] ? -1 : i)).filter((i) => i >= 0);
    expect(base!.argv.length).toBe(b!.argv.length);
    expect(diffs).toEqual([base!.argv.indexOf("/tmp/base.md")]);
  });
});

describe("lowerIsBetter", () => {
  test("true for words, count, phrases, long_paragraphs", () => {
    expect(lowerIsBetter({ name: "w", kind: "words" })).toBe(true);
    expect(lowerIsBetter({ name: "c", kind: "count", pattern: "x" })).toBe(true);
    expect(lowerIsBetter({ name: "p", kind: "phrases", list: ["x"] })).toBe(true);
    expect(lowerIsBetter({ name: "l", kind: "long_paragraphs", max_lines: 4 })).toBe(true);
  });

  test("false for ends_with", () => {
    expect(lowerIsBetter({ name: "e", kind: "ends_with", pattern: "\\?$" })).toBe(false);
  });
});
