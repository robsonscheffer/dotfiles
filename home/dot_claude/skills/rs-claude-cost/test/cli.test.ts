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

  test("--week picks the requested ISO week", async () => {
    const { exitCode, stdout } = await run(["--week", "2026-W39"]);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).isoWeek).toBe("2026-W39");
  });
});
