import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { runVerify } from "../../src/commands/verify.ts";
import { claimHash, loadLedger } from "../../src/ledger/index.ts";
import { EXIT, type Env, type RunResult } from "../../src/types.ts";
import { buildPrompt } from "../../src/verify/prompt.ts";
import { mkTmpDir, rmTmpDir } from "../commands/util.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkTmpDir("mate-doc-verify-test-");
  dirs.push(dir);
  return dir;
}
const savedXdg = process.env.XDG_CONFIG_HOME;
beforeEach(async () => {
  process.env.XDG_CONFIG_HOME = await tempDir();
});
afterEach(async () => {
  if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = savedXdg;
  await Promise.all(dirs.splice(0).map(rmTmpDir));
});

const BODY = "Widgets ship every Tuesday.\nRefunds take five days.\n";

function answer(verdict: string, quote: string, reason = "The page says so."): RunResult {
  return {
    code: 0,
    stdout: JSON.stringify({
      structured_output: { verdict, reason, quote },
      modelUsage: { "claude-sonnet-x": {} },
    }),
    stderr: "",
  };
}

interface Call {
  cmd: string[];
  opts?: { cwd?: string; timeoutMs?: number; input?: string };
}

function recordingEnv(agent: RunResult | ((n: number) => RunResult), body = BODY): { env: Env; calls: Call[]; fetches: string[] } {
  const calls: Call[] = [];
  const fetches: string[] = [];
  let n = 0;
  const env: Env = {
    has: () => true,
    fetch: async (url) => {
      fetches.push(url);
      return { status: 200, body };
    },
    now: () => new Date("2026-09-30T12:00:00Z"),
    run: async (cmd, opts) => {
      calls.push({ cmd, opts });
      return typeof agent === "function" ? agent(n++) : agent;
    },
  };
  return { env, calls, fetches };
}

function ledgerText(claims: string, author = "author: human:Alex\n"): string {
  return `${author}claims:\n${claims}`;
}

const LINK_CLAIM = (id: string, extra = "", claim = "Widgets ship every Tuesday.", excerpt = "ship every Tuesday") => `  - id: ${id}
    claim: ${claim}
    status: proposed
    evidence:
      kind: link
      url: https://example.com/${id}
      excerpt: ${excerpt}
      needs: http
${extra}`;

async function setup(claims: string, author?: string): Promise<string> {
  const dir = await tempDir();
  await writeFile(join(dir, "index.md"), "---\ntitle: Doc\n---\n\nBody. {C1}\n");
  await writeFile(join(dir, "claims.yaml"), author === undefined ? ledgerText(claims) : ledgerText(claims, author));
  return dir;
}

async function claimOf(dir: string, id: string) {
  const ledger = await loadLedger(dir);
  return ledger!.claims.find((c) => c.id === id)!;
}

async function capture(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((s: string | Uint8Array) => {
    chunks.push(String(s));
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await fn();
    return { code, out: chunks.join("") };
  } finally {
    process.stdout.write = orig;
  }
}

describe("verify: agent call", () => {
  test("argv, isolation, and timeout", async () => {
    const dir = await setup(LINK_CLAIM("C1"));
    const { env, calls } = recordingEnv(answer("supports", "ship every Tuesday"));
    const { code } = await capture(() => runVerify([dir], env));
    expect(code).toBe(EXIT.ok);
    expect(calls).toHaveLength(1);
    const { cmd, opts } = calls[0]!;
    expect(cmd.slice(0, 3)).toEqual(["claude", "-p", "--safe-mode"]);
    const tools = cmd.indexOf("--tools");
    expect(cmd[tools + 1]).toBe("");
    expect(cmd).toContain("--no-session-persistence");
    const fmt = cmd.indexOf("--output-format");
    expect(cmd[fmt + 1]).toBe("json");
    const schema = JSON.parse(cmd[cmd.indexOf("--json-schema") + 1]!);
    expect(schema.required).toEqual(["verdict", "reason", "quote"]);
    expect(schema.additionalProperties).toBe(false);
    expect(cmd[cmd.indexOf("--model") + 1]).toBe("sonnet");
    expect(opts?.timeoutMs).toBe(180000);
    expect(opts?.cwd).toBeTruthy();
    expect(opts!.cwd!.startsWith(dir)).toBe(false);
    expect(opts!.cwd).not.toBe(dir);
  });

  test("--model flag and verify.model config choose the model", async () => {
    const dir = await setup(LINK_CLAIM("C1"));
    let { env, calls } = recordingEnv(answer("supports", "ship every Tuesday"));
    await capture(() => runVerify([dir, "--model", "opus"], env));
    expect(calls[0]!.cmd[calls[0]!.cmd.indexOf("--model") + 1]).toBe("opus");

    await writeFile(join(dir, "claims.yaml"), ledgerText(LINK_CLAIM("C1")));
    await Bun.$`mkdir -p ${process.env.XDG_CONFIG_HOME}/mate-doc`.quiet();
    await writeFile(
      join(process.env.XDG_CONFIG_HOME!, "mate-doc", "config.yaml"),
      "verify:\n  command: mycli -p\n  model: haiku\n",
    );
    ({ env, calls } = recordingEnv(answer("supports", "ship every Tuesday")));
    await capture(() => runVerify([dir], env));
    expect(calls[0]!.cmd.slice(0, 2)).toEqual(["mycli", "-p"]);
    expect(calls[0]!.cmd[calls[0]!.cmd.indexOf("--model") + 1]).toBe("haiku");
  });

  test("the prompt has the claim and the window, and no doc path or sql file name", async () => {
    const dir = await setup(
      `${LINK_CLAIM("C1", "", "Widgets ship every Tuesday.", "ship every Tuesday")}  - id: C2
    claim: The widget count is 7.
    status: proposed
    evidence:
      kind: query
      sql: secret_folder/count.sql
      expect:
        value: 7
      needs: snow
`,
    );
    await Bun.$`mkdir -p ${join(dir, "secret_folder")}`.quiet();
    await writeFile(join(dir, "secret_folder", "count.sql"), "select 7 as n");
    const prompts: string[] = [];
    const env: Env = {
      has: () => true,
      fetch: async () => ({ status: 200, body: BODY }),
      now: () => new Date("2026-09-30T12:00:00Z"),
      run: async (cmd, opts) => {
        if (cmd[0] === "snow") return { code: 0, stdout: '[{"n": 7}]', stderr: "" };
        prompts.push(opts?.input ?? "");
        return answer("uncheckable", "");
      },
    };
    await capture(() => runVerify([dir], env));
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("Widgets ship every Tuesday.");
    expect(prompts[0]).toContain("Refunds take five days.");
    expect(prompts[1]).toContain("select 7 as n");
    for (const p of prompts) {
      expect(p).not.toContain(dir);
      expect(p).not.toContain("secret_folder");
      expect(p).not.toContain("claims.yaml");
    }
  });

  test("buildPrompt takes only the claim, kind, ref, and window", () => {
    const p = buildPrompt("Claim text.", "code", "acme/widgets@main:a.ts:3", "3: const x = 1;");
    expect(p).toContain("Claim text.");
    expect(p).toContain("3: const x = 1;");
    expect(p).toContain("acme/widgets@main:a.ts:3");
    for (const v of ["supports", "overstates", "contradicts", "unrelated", "uncheckable"]) {
      expect(p).toContain(`- ${v}:`);
    }
    expect(p).toContain("verbatim");
  });

  test("code evidence: window is numbered and clamped, and a gh fetch feeds the agent", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    const content = Buffer.from(lines.join("\n")).toString("base64");
    const dir = await setup(`  - id: C1
    claim: Line 50 says line 50.
    status: proposed
    evidence:
      kind: code
      ref: acme/widgets@main:src/a.ts:50
      excerpt: line 50
      needs: gh
`);
    const seen: string[] = [];
    const env: Env = {
      has: () => true,
      fetch: async () => ({ status: 200, body: "" }),
      now: () => new Date("2026-09-30T12:00:00Z"),
      run: async (cmd, opts) => {
        if (cmd[0] === "gh") return { code: 0, stdout: JSON.stringify({ content, encoding: "base64" }), stderr: "" };
        seen.push(opts?.input ?? "");
        return answer("supports", "line 50");
      },
    };
    const { code } = await capture(() => runVerify([dir], env));
    expect(code).toBe(EXIT.ok);
    expect(seen[0]).toContain("30: line 30");
    expect(seen[0]).toContain("70: line 70");
    expect(seen[0]).not.toContain("29: line 29");
    expect(seen[0]).not.toContain("71: line 71");
  });
});

describe("verify: writes", () => {
  test("supports writes verified, verdict, checked_by, hash, and reason", async () => {
    const dir = await setup(LINK_CLAIM("C1"));
    const { env } = recordingEnv(answer("supports", "ship every Tuesday", "Line 1 says it: a: b # c"));
    const { code, out } = await capture(() => runVerify([dir], env));
    expect(code).toBe(EXIT.ok);
    expect(out).toContain("C1 supports");
    const c = await claimOf(dir, "C1");
    expect(c.status).toBe("verified");
    expect(c.verdict).toBe("supports");
    expect(c.checked_by).toBe("verifier:claude-sonnet-x");
    expect(c.checked_at).toBe("2026-09-30");
    expect(c.verdict_reason).toBe("Line 1 says it: a: b # c");
    expect(c.verdict_hash).toBe(claimHash(c));
  });

  test("uncheckable writes verdict and reason and leaves the claim proposed", async () => {
    const dir = await setup(LINK_CLAIM("C1"));
    const { env } = recordingEnv(answer("uncheckable", "", "An opinion."));
    const { code, out } = await capture(() => runVerify([dir], env));
    expect(code).toBe(EXIT.failed);
    expect(out).toContain("C1 uncheckable: An opinion.");
    const c = await claimOf(dir, "C1");
    expect(c.status).toBe("proposed");
    expect(c.verdict).toBe("uncheckable");
    expect(c.verdict_reason).toBe("An opinion.");
    expect(c.checked_by).toBe("verifier:claude-sonnet-x");
  });

  test("a non-supports verdict sends a verified claim back to proposed", async () => {
    const dir = await setup(
      LINK_CLAIM("C1").replace("status: proposed", "status: verified\n    verdict: supports\n    checked_by: agent:claude"),
    );
    const { env } = recordingEnv(answer("overstates", "", "Too strong."));
    await capture(() => runVerify([dir], env));
    const c = await claimOf(dir, "C1");
    expect(c.status).toBe("proposed");
    expect(c.verdict).toBe("overstates");
  });

  test("falls back to the configured model alias when modelUsage is missing", async () => {
    const dir = await setup(LINK_CLAIM("C1"));
    const { env } = recordingEnv({
      code: 0,
      stdout: JSON.stringify({ structured_output: { verdict: "supports", reason: "ok", quote: "ship every Tuesday" } }),
      stderr: "",
    });
    await capture(() => runVerify([dir], env));
    expect((await claimOf(dir, "C1")).checked_by).toBe("verifier:sonnet");
  });
});

describe("verify: guards and skips", () => {
  test("supports with a quote not in the window writes nothing", async () => {
    const dir = await setup(LINK_CLAIM("C1"));
    const before = await readFile(join(dir, "claims.yaml"), "utf8");
    const { env } = recordingEnv(answer("supports", "Widgets ship every Friday"));
    const { code, out } = await capture(() => runVerify([dir], env));
    expect(code).toBe(EXIT.failed);
    expect(out).toContain("C1 verifier-quote-missing");
    expect(await readFile(join(dir, "claims.yaml"), "utf8")).toBe(before);
  });

  test("an excerpt missing from the fetched window is drift with no agent call", async () => {
    const dir = await setup(LINK_CLAIM("C1", "", "Widgets ship daily.", "ship daily"));
    const before = await readFile(join(dir, "claims.yaml"), "utf8");
    const { env, calls, fetches } = recordingEnv(answer("supports", "x"));
    const { code, out } = await capture(() => runVerify([dir], env));
    expect(code).toBe(EXIT.failed);
    expect(out).toContain("C1 drift");
    expect(calls).toHaveLength(0);
    expect(fetches).toHaveLength(1);
    expect(await readFile(join(dir, "claims.yaml"), "utf8")).toBe(before);
  });

  test("mcp evidence needs a human and runs nothing", async () => {
    const dir = await setup(`  - id: C1
    claim: The thread agreed.
    status: proposed
    evidence:
      kind: mcp
      source: https://chat.example.com/t/1
      excerpt: agreed
      needs: mcp:chat
`);
    const { env, calls, fetches } = recordingEnv(answer("supports", "agreed"));
    const { code, out } = await capture(() => runVerify([dir], env));
    expect(code).toBe(EXIT.failed);
    expect(out).toContain("C1 needs a human verdict");
    expect(calls).toHaveLength(0);
    expect(fetches).toHaveLength(0);
  });

  test("--dry-run prints the prompt and argv and writes and calls nothing", async () => {
    const dir = await setup(LINK_CLAIM("C1"));
    const before = await readFile(join(dir, "claims.yaml"), "utf8");
    const { env, calls } = recordingEnv(answer("supports", "ship every Tuesday"));
    const { code, out } = await capture(() => runVerify([dir, "--dry-run"], env));
    expect(code).toBe(EXIT.ok);
    expect(calls).toHaveLength(0);
    expect(out).toContain("--json-schema");
    expect(out).toContain("Widgets ship every Tuesday.");
    expect(await readFile(join(dir, "claims.yaml"), "utf8")).toBe(before);
  });

  test("a non-zero exit or bad JSON writes nothing and reports verifier-error", async () => {
    for (const result of [
      { code: 1, stdout: "", stderr: "boom" },
      { code: 0, stdout: "not json", stderr: "" },
      { code: 0, stdout: JSON.stringify({ result: "hi" }), stderr: "" },
      { code: 0, stdout: JSON.stringify({ structured_output: { verdict: "great", reason: "r", quote: "q" } }), stderr: "" },
    ]) {
      const dir = await setup(LINK_CLAIM("C1"));
      const before = await readFile(join(dir, "claims.yaml"), "utf8");
      const { env } = recordingEnv(result);
      const { code, out } = await capture(() => runVerify([dir], env));
      expect(code).toBe(EXIT.failed);
      expect(out).toContain("C1 verifier-error");
      expect(await readFile(join(dir, "claims.yaml"), "utf8")).toBe(before);
    }
  });
});

describe("verify: selection", () => {
  const verified = (id: string, by: string, hash: string, text = "Widgets ship every Tuesday.") =>
    `  - id: ${id}
    claim: ${text}
    status: verified
    verdict: supports
    checked_by: ${by}
    verdict_hash: ${hash}
    evidence:
      kind: link
      url: https://example.com/${id}
      excerpt: ship every Tuesday
      needs: http
`;
  const hashOf = (id: string, text = "Widgets ship every Tuesday.") =>
    claimHash({
      claim: text,
      evidence: { kind: "link", url: `https://example.com/${id}`, excerpt: "ship every Tuesday", needs: "http" },
    });

  test("skips a verifier-verified claim with a matching hash", async () => {
    const dir = await setup(verified("C1", "verifier:x", hashOf("C1")));
    const { env, calls } = recordingEnv(answer("supports", "ship every Tuesday"));
    const { code, out } = await capture(() => runVerify([dir], env));
    expect(code).toBe(EXIT.ok);
    expect(out).toContain("nothing to check");
    expect(calls).toHaveLength(0);
  });

  test("re-asks a claim whose text was edited (stale hash)", async () => {
    const dir = await setup(verified("C1", "verifier:x", hashOf("C1", "Old text."), "Widgets ship every Tuesday."));
    const { env, calls } = recordingEnv(answer("supports", "ship every Tuesday"));
    await capture(() => runVerify([dir], env));
    expect(calls).toHaveLength(1);
    expect((await claimOf(dir, "C1")).verdict_hash).toBe(hashOf("C1"));
  });

  test("re-asks a claim verified by an agent", async () => {
    const dir = await setup(verified("C1", "agent:claude", hashOf("C1")));
    const { env, calls } = recordingEnv(answer("supports", "ship every Tuesday"));
    await capture(() => runVerify([dir], env));
    expect(calls).toHaveLength(1);
    expect((await claimOf(dir, "C1")).checked_by).toBe("verifier:claude-sonnet-x");
  });

  test("--claims picks exactly those ids; an unknown id is a usage error", async () => {
    const dir = await setup(verified("C1", "verifier:x", hashOf("C1")) + LINK_CLAIM("C2"));
    const { env, calls } = recordingEnv(answer("supports", "ship every Tuesday"));
    await capture(() => runVerify([dir, "--claims", "C1"], env));
    expect(calls).toHaveLength(1);
    expect(await runVerify([dir, "--claims", "C9"], env)).toBe(EXIT.usage);
  });

  test("a ledger with no author still runs and says so once", async () => {
    const dir = await setup(LINK_CLAIM("C1"), "");
    const { env } = recordingEnv(answer("supports", "ship every Tuesday"));
    const { code, out } = await capture(() => runVerify([dir], env));
    expect(code).toBe(EXIT.ok);
    expect(out.match(/ledger has no author/g)).toHaveLength(1);
    expect(await readFile(join(dir, "claims.yaml"), "utf8")).not.toContain("author:");
  });

  test("checks claims one at a time in ledger order", async () => {
    const dir = await setup(LINK_CLAIM("C1") + LINK_CLAIM("C2"));
    const { env } = recordingEnv(answer("supports", "ship every Tuesday"));
    const { out } = await capture(() => runVerify([dir], env));
    expect(out.indexOf("C1 supports")).toBeLessThan(out.indexOf("C2 supports"));
  });
});

describe("verify: cli", () => {
  test("verify without a path is a usage error", async () => {
    expect(await main(["verify"])).toBe(EXIT.usage);
  });
});
