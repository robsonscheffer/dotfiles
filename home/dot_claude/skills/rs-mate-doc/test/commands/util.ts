// Shared test helpers for command tests.
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Env, RunResult } from "../../src/types.ts";

export async function mkTmpDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return realpath(dir);
}

export async function rmTmpDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    has: () => true,
    run: async (): Promise<RunResult> => ({ code: 0, stdout: "", stderr: "" }),
    fetch: async () => ({ status: 200, body: "" }),
    now: () => new Date("2026-09-25T00:00:00Z"),
    ...overrides,
  };
}
