// Real Env: the capability checks, process runner, and network fetch that back audit/gate
// outside of tests. Tests inject their own fake Env instead of this one.
import type { Capability, Env, RunResult } from "./types.ts";

const BINARY_CAPABILITIES: readonly ("git" | "gh" | "snow")[] = ["git", "gh", "snow"];

const DEFAULT_RUN_TIMEOUT_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;

export function createEnv(): Env {
  return {
    has(cap: Capability): boolean {
      if (cap === "http") return true;
      if (cap.startsWith("mcp:")) return false;
      if ((BINARY_CAPABILITIES as readonly string[]).includes(cap)) {
        return Bun.which(cap) !== null;
      }
      return false;
    },

    async run(cmd: string[], opts?: { cwd?: string; timeoutMs?: number }): Promise<RunResult> {
      const timeoutMs = opts?.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
      const proc = Bun.spawn(cmd, {
        cwd: opts?.cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // already gone
        }
      }, timeoutMs);
      try {
        const [stdout, stderr, code] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        return { code, stdout, stderr };
      } finally {
        clearTimeout(timer);
      }
    },

    async fetch(url: string): Promise<{ status: number; body: string }> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: controller.signal });
        const body = await res.text();
        return { status: res.status, body };
      } finally {
        clearTimeout(timer);
      }
    },

    now(): Date {
      return new Date();
    },
  };
}
