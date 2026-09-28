// mdview compatibility: `mate-doc open --url <path>` (what `mdview --url` delegates to) prints
// the URL and never opens a browser; `--alias` sets the folder's URL segment.
import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runOpen } from "../../src/commands/open.ts";
import { writePidFile } from "../../src/serve/state.ts";
import { mkTmpDir, rmTmpDir } from "./util.ts";

const dirs: string[] = [];
const savedEnv: Record<string, string | undefined> = {};

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkTmpDir(prefix);
  dirs.push(dir);
  return dir;
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: string) => {
    lines.push(String(chunk));
    return true;
  };
  return {
    lines,
    restore: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout as any).write = original;
    },
  };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(rmTmpDir));
  for (const key of Object.keys(savedEnv)) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function setEnv(key: string, value: string): void {
  savedEnv[key] = process.env[key];
  process.env[key] = value;
}

describe("mate-doc open: mdview compatibility flags", () => {
  test("--url prints the URL and does not throw trying to open a browser", async () => {
    const stateDir = await tempDir("mate-doc-open-cli-state-");
    const served = await tempDir("mate-doc-open-cli-served-");
    writeFileSync(join(served, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");

    setEnv("MATE_DOC_STATE_DIR", stateDir);
    setEnv("MATE_DOC_PORT", "59997");
    await writePidFile(stateDir, { pid: process.pid, port: 59997, url: "http://127.0.0.1:59997" });

    const capture = captureStdout();
    let code: number;
    try {
      code = await runOpen(["--url", served]);
    } finally {
      capture.restore();
    }

    expect(code).toBe(0);
    expect(capture.lines.join("")).toContain("http://127.0.0.1:59997/");
  });

  test("--alias sets the folder's URL segment", async () => {
    const stateDir = await tempDir("mate-doc-open-cli-alias-state-");
    const served = await tempDir("mate-doc-open-cli-alias-served-");
    writeFileSync(join(served, "index.md"), "---\ntitle: Doc\n---\n\nBody.\n");

    setEnv("MATE_DOC_STATE_DIR", stateDir);
    setEnv("MATE_DOC_PORT", "59996");
    await writePidFile(stateDir, { pid: process.pid, port: 59996, url: "http://127.0.0.1:59996" });

    const capture = captureStdout();
    let code: number;
    try {
      code = await runOpen([served, "--alias", "artifacts", "--url"]);
    } finally {
      capture.restore();
    }

    expect(code).toBe(0);
    expect(capture.lines.join("")).toContain("http://127.0.0.1:59996/artifacts/");
  });
});
