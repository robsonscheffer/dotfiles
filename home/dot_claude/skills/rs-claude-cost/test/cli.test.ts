import { describe, expect, test } from "bun:test";
import { statSync } from "node:fs";
import { join } from "node:path";

const cliPath = join(import.meta.dir, "..", "src", "cli.ts");
const shimPath = join(import.meta.dir, "..", "bin", "executable_rs-claude-cost");

async function run(args: string[]) {
  const proc = Bun.spawn(["bun", cliPath, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("cli", () => {
  test("--help exits 0 and prints usage", async () => {
    const { exitCode, stdout } = await run(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("rs-claude-cost");
  });

  test("an unknown flag exits 64", async () => {
    const { exitCode, stderr } = await run(["--not-a-real-flag"]);
    expect(exitCode).toBe(64);
    expect(stderr).toContain("unknown flag");
  });

  test("the shim carries the executable bit in git", () => {
    const mode = statSync(shimPath).mode;
    // eslint-disable-next-line no-bitwise
    expect(mode & 0o111).not.toBe(0);
  });

  test("an empty transcript root produces a zeroed report and exits 0", async () => {
    const emptyRoot = await import("./helpers.ts").then((m) => m.makeTmpRoot("rs-cost-empty"));
    const outDir = await import("./helpers.ts").then((m) => m.makeTmpRoot("rs-cost-out"));
    const { exitCode, stdout } = await run([
      "--week",
      "2026-W39",
      "--root",
      emptyRoot,
      "--out",
      outDir,
      "--no-record",
      "--json",
    ]);
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.totals.dollars).toBe(0);
    expect(report.totals.sessions).toBe(0);
  });

  test("the default terminal summary prints without --json and stays under 45 lines", async () => {
    const emptyRoot = await import("./helpers.ts").then((m) => m.makeTmpRoot("rs-cost-empty-cli"));
    const outDir = await import("./helpers.ts").then((m) => m.makeTmpRoot("rs-cost-out-cli"));
    const { exitCode, stdout } = await run([
      "--week",
      "2026-W39",
      "--root",
      emptyRoot,
      "--out",
      outDir,
      "--no-record",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("rs-claude-cost");
    expect(stdout.split("\n").length).toBeLessThanOrEqual(45);
  });

  test("--quiet suppresses the terminal summary", async () => {
    const emptyRoot = await import("./helpers.ts").then((m) => m.makeTmpRoot("rs-cost-empty-quiet"));
    const outDir = await import("./helpers.ts").then((m) => m.makeTmpRoot("rs-cost-out-quiet"));
    const { exitCode, stdout } = await run([
      "--week",
      "2026-W39",
      "--root",
      emptyRoot,
      "--out",
      outDir,
      "--no-record",
      "--quiet",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("");
  });
});
