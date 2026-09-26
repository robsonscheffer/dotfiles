import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEnv } from "../../src/env.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-env-"));
  dirs.push(dir);
  return dir;
}

const savedPath = process.env.PATH;
const savedSnowTimeout = process.env.MATE_DOC_SNOW_TIMEOUT_MS;
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  process.env.PATH = savedPath;
  if (savedSnowTimeout === undefined) delete process.env.MATE_DOC_SNOW_TIMEOUT_MS;
  else process.env.MATE_DOC_SNOW_TIMEOUT_MS = savedSnowTimeout;
});

// Writes a fake "snow" on PATH so these tests never touch a real snow install.
async function fakeSnowOnPath(script: string): Promise<string> {
  const dir = await tempDir();
  const binPath = join(dir, "snow");
  await writeFile(binPath, script);
  await chmod(binPath, 0o755);
  process.env.PATH = `${dir}:${savedPath ?? ""}`;
  return dir;
}

describe("createEnv().run: stdin is closed", () => {
  test("a command that reads stdin sees immediate EOF instead of hanging", async () => {
    await fakeSnowOnPath("#!/bin/sh\nread line\necho \"got:$line\"\n");
    const env = createEnv();
    const start = Date.now();
    const result = await env.run(["snow"], { timeoutMs: 5000 });
    const elapsed = Date.now() - start;
    // If stdin were inherited/open with no data, `read` blocks until the 5s timeout kills it.
    // With stdin closed, `read` sees EOF right away.
    expect(elapsed).toBeLessThan(2000);
    expect(result.stdout).toContain("got:");
  });
});

describe("createEnv().run: snow gets its own timeout", () => {
  test("MATE_DOC_SNOW_TIMEOUT_MS overrides the default for a snow command specifically", async () => {
    // `exec` so the script's own process *is* sleep, not a shell waiting on a sleep child: a
    // real snow binary is a single process too, and this way SIGTERM lands where it matters.
    await fakeSnowOnPath("#!/bin/sh\nexec sleep 5\n");
    process.env.MATE_DOC_SNOW_TIMEOUT_MS = "300";
    const env = createEnv();
    const start = Date.now();
    const result = await env.run(["snow"]); // no explicit timeoutMs: picks up the snow default
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000); // killed well before the script's own 5s sleep finishes
    expect(result.code).not.toBe(0);
  });

  test("a non-snow command is unaffected by MATE_DOC_SNOW_TIMEOUT_MS", async () => {
    process.env.MATE_DOC_SNOW_TIMEOUT_MS = "50";
    const env = createEnv();
    const result = await env.run(["echo", "hi"]);
    expect(result.stdout.trim()).toBe("hi");
  });
});
