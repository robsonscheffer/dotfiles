// Golden fixtures: synthetic docs for a made-up shop (acme/web, orders, checkout; Sam, Alex,
// Priya) that exercise parse -> render -> lint -> audit -> gate end to end.
//
// gate() carries its own private doc loader for now (see src/gate/index.ts header comment) that
// only reads a folder's single primary markdown file and does not understand nesting, tables, or
// lists. Lane I1 is replacing that loader with the real parser and will gate every .md page in a
// folder. Because of that, assertions here stick to gate's contract (pass, levels, which claim
// ids show up in reasons) and never to the exact "rule" string or message text on a gate reason,
// which will change once the real loader lands. lint() itself always runs against the real
// parser's Docs, so its rule assertions are exact.

import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { audit } from "../../src/audit/index.ts";
import { gate } from "../../src/gate/index.ts";
import { ledgerHash, loadLedger } from "../../src/ledger/index.ts";
import { lint } from "../../src/lint/index.ts";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import type { Capability, Doc, Env, LintRule, RunResult } from "../../src/types.ts";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

// ---------------------------------------------------------------------------------------------
// Helpers

async function loadDocs(dir: string): Promise<Doc[]> {
  const names = (await readdir(dir)).filter((n) => n.endsWith(".md")).sort();
  const docs: Doc[] = [];
  for (const name of names) {
    const path = join(dir, name);
    const src = await readFile(path, "utf8");
    docs.push(parse(src, path));
  }
  return docs;
}

function errorsOf(issues: { severity: "error" | "warn" }[]) {
  return issues.filter((i) => i.severity === "error");
}

// Render invariants that must hold for every ordinary fixture: no em-dash ever leaks into
// output, and no <link>/<script>/<img> tag points its src/href at an http(s) resource. (<a>
// tags are allowed to carry http links: those are the point of the "link" directive/markdown
// link, not a resource load.)
function assertRenderInvariants(html: string): void {
  expect(html.includes("\u2014")).toBe(false);
  const tagRe = /<(link|script|img)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const tag = m[0];
    const resourceUrl = /(?:src|href)\s*=\s*["']?(https?:)/i.exec(tag);
    expect(resourceUrl).toBeNull();
  }
}

const DIRECTIVE_MARKERS: Record<string, string> = {
  means: 'class="callout callout-means"',
  warn: 'class="callout callout-warn"',
  note: 'class="callout callout-note"',
  collide: 'class="callout callout-collide"',
  tiles: 'class="tiles"',
  flow: 'class="flow-diagram"',
  steps: 'class="steps"',
  tabs: 'class="tabs"',
  cards: 'class="cards"',
  decide: 'class="callout callout-decide"',
  risks: 'class="risks"',
  notverified: "not-verified-list",
  rail: 'class="rail"',
};

interface FakeEnvOpts {
  caps?: Capability[];
  gitShow?: Record<string, string>; // key "<rev>:<path>" -> file content
  snowRows?: Record<string, unknown[]>; // key: substring of the sql text -> rows returned
  http?: Record<string, { status: number; body: string }>;
  now?: string;
}

function makeEnv(opts: FakeEnvOpts = {}): Env {
  return {
    has: (cap) => (opts.caps ? opts.caps.includes(cap) : true),
    run: async (cmd): Promise<RunResult> => {
      if (cmd[0] === "git") {
        const key = cmd[2] ?? "";
        const content = opts.gitShow?.[key];
        if (content === undefined) return { code: 1, stdout: "", stderr: `no fixture git content for ${key}` };
        return { code: 0, stdout: content, stderr: "" };
      }
      if (cmd[0] === "gh" && cmd[1] === "api") {
        // Code evidence with no local checkout falls back to the contents API:
        // repos/<owner>/<repo>/contents/<path>?ref=<rev>, answered from the same gitShow map.
        const m = /^repos\/[^/]+\/[^/]+\/contents\/(.+)\?ref=(.+)$/.exec(cmd[2] ?? "");
        const content = m ? opts.gitShow?.[`${m[2]}:${m[1]}`] : undefined;
        if (content === undefined) return { code: 1, stdout: "", stderr: `no fixture content for ${cmd[2]}` };
        return { code: 0, stdout: JSON.stringify({ content: Buffer.from(content).toString("base64"), encoding: "base64" }), stderr: "" };
      }
      if (cmd[0] === "snow") {
        const sqlText = cmd[cmd.length - 1] ?? "";
        const key = Object.keys(opts.snowRows ?? {}).find((k) => sqlText.includes(k));
        const rows = key ? (opts.snowRows![key] ?? []) : [];
        return { code: 0, stdout: JSON.stringify(rows), stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
    fetch: async (url) => opts.http?.[url] ?? { status: 404, body: "" },
    now: () => new Date(opts.now ?? "2026-09-25T00:00:00Z"),
  };
}

// A fake git-show file with `excerpt` placed at 1-based `line`, surrounded by filler so the
// audit checker's +/-3 line window has something real to search.
function gitFileWithExcerptAtLine(excerpt: string, line: number, totalLines = 40): string {
  const lines = Array.from({ length: totalLines }, (_, i) => `// line ${i + 1}`);
  lines[line - 1] = `  ${excerpt}`;
  return lines.join("\n");
}

function gitFileWithoutExcerpt(totalLines = 40): string {
  return Array.from({ length: totalLines }, (_, i) => `// unrelated line ${i + 1}`).join("\n");
}

// ---------------------------------------------------------------------------------------------
// plain.md: no frontmatter, every basic block kind, no ledger involved.

describe("golden: plain.md", () => {
  test("parses, renders, and lints clean", async () => {
    const path = join(FIXTURES, "plain.md");
    const src = await readFile(path, "utf8");
    const doc = parse(src, path);
    expect(doc.errors).toHaveLength(0);

    const html = render(doc, null, { theme: "auto" });
    assertRenderInvariants(html);
    expect(html).toContain("<table>");
    expect(html).toContain("<pre>");
    expect(html).toContain('<ol>');
    expect(html).toContain('<a href="https://example.com/acme/reference"');

    const issues = lint([doc], null);
    expect(errorsOf(issues)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// golden-guide: every directive at least once, all evidence kinds, two open not_verified.

describe("golden: golden-guide", () => {
  const dir = join(FIXTURES, "golden-guide");

  test("parses every page, renders every directive, lints clean, gates green", async () => {
    const docs = await loadDocs(dir);
    expect(docs).toHaveLength(4);
    for (const doc of docs) expect(doc.errors).toHaveLength(0);

    const ledger = await loadLedger(dir);
    expect(ledger).not.toBeNull();
    expect(ledger?.claims).toHaveLength(6);

    let allHtml = "";
    for (const doc of docs) {
      const html = render(doc, ledger, { theme: "auto" });
      assertRenderInvariants(html);
      allHtml += html;
    }
    for (const [name, marker] of Object.entries(DIRECTIVE_MARKERS)) {
      expect(allHtml.includes(marker), `directive ${name} should render ${marker}`).toBe(true);
    }

    const issues = lint(docs, ledger);
    expect(errorsOf(issues)).toHaveLength(0);

    const env = makeEnv({
      gitShow: {
        "origin/main:src/analytics/checkout.ts": gitFileWithExcerptAtLine("track('checkout_clicked')", 18),
      },
      snowRows: { "checkout_path = 'fast'": [{ orders: 312 }] },
      http: {
        "https://example.com/acme/api-docs": { status: 200, body: "POST /refunds returns a refund object." },
      },
    });

    const auditResult = await audit(dir, env);
    expect(auditResult.freshness.fresh).toBe(true);

    const gateResult = await gate(dir, env);
    expect(gateResult.pass).toBe(true);
    expect(gateResult.reasons).toHaveLength(0);
    expect(gateResult.levelBefore).toBe("draft");
    expect(gateResult.levelAfter).toBe("audited");
  });
});

// ---------------------------------------------------------------------------------------------
// golden-brief: shorter shape, shorter ttl_days, still clean end to end.

describe("golden: golden-brief", () => {
  const dir = join(FIXTURES, "golden-brief");

  test("parses, renders, lints clean, gates green", async () => {
    const docs = await loadDocs(dir);
    expect(docs).toHaveLength(3);
    for (const doc of docs) expect(doc.errors).toHaveLength(0);

    const ledger = await loadLedger(dir);
    expect(ledger?.claims).toHaveLength(2);
    expect(ledger?.claims.every((c) => c.ttl_days === 7)).toBe(true);

    for (const doc of docs) {
      const html = render(doc, ledger, { theme: "auto" });
      assertRenderInvariants(html);
    }

    const issues = lint(docs, ledger);
    expect(errorsOf(issues)).toHaveLength(0);

    const env = makeEnv({
      snowRows: { "checkout_path = 'fast'": [{ orders: 312 }] },
      http: {
        "https://example.com/acme/release-notes": {
          status: 200,
          body: "The fast-checkout flag is now on by default.",
        },
      },
    });

    const auditResult = await audit(dir, env);
    expect(auditResult.freshness.fresh).toBe(true);

    const gateResult = await gate(dir, env);
    expect(gateResult.pass).toBe(true);
    expect(gateResult.reasons).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// drift: a code claim whose excerpt is gone, and a query claim whose value leaves tolerance.

describe("golden: drift", () => {
  const dir = join(FIXTURES, "drift");

  test("audit marks both claims stale as drift, gate fails on both", async () => {
    const docs = await loadDocs(dir);
    for (const doc of docs) expect(doc.errors).toHaveLength(0);

    const ledger = await loadLedger(dir);
    const issues = lint(docs, ledger);
    expect(errorsOf(issues)).toHaveLength(0);

    const env = makeEnv({
      gitShow: {
        "origin/main:src/analytics/checkout.ts": gitFileWithoutExcerpt(),
      },
      snowRows: { "checkout_path = 'fast'": [{ orders: 500 }] },
    });

    const auditResult = await audit(dir, env);
    expect(auditResult.freshness.fresh).toBe(false);
    const staleReasonByClaim = new Map(auditResult.freshness.stale.map((s) => [s.claim, s.reason]));
    expect(staleReasonByClaim.get("C1")).toBe("drift");
    expect(staleReasonByClaim.get("C2")).toBe("drift");

    const gateResult = await gate(dir, env);
    expect(gateResult.pass).toBe(false);
    const failingClaims = new Set(gateResult.reasons.map((r) => r.claim));
    expect(failingClaims.has("C1")).toBe(true);
    expect(failingClaims.has("C2")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// lint-failures: one artifact per lint rule that must fail, each with a locatable line.

describe("golden: lint-failures", () => {
  const dir = join(FIXTURES, "lint-failures");

  test("every rule fires, each with a real line", async () => {
    const docs = await loadDocs(dir);
    const ledger = await loadLedger(dir);
    const issues = lint(docs, ledger);

    const expectedRules: LintRule[] = [
      "claim-unresolved",
      "em-dash",
      "private-path",
      "localhost-url",
      "not-verified-without-owner",
      "secret-in-excerpt",
      "pii-in-excerpt",
    ];
    for (const rule of expectedRules) {
      const found = issues.find((i) => i.rule === rule);
      expect(found, `expected a "${rule}" lint issue`).toBeDefined();
      expect(found?.pos?.start.line).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// draft-doc: a passing guide explicitly left at status: draft.

describe("golden: draft-doc", () => {
  const dir = join(FIXTURES, "draft-doc");

  test("passes gate while the frontmatter stays at draft", async () => {
    const docs = await loadDocs(dir);
    for (const doc of docs) expect(doc.errors).toHaveLength(0);

    const ledger = await loadLedger(dir);
    const issues = lint(docs, ledger);
    expect(errorsOf(issues)).toHaveLength(0);

    for (const doc of docs) {
      const html = render(doc, ledger, { theme: "auto" });
      assertRenderInvariants(html);
    }

    const env = makeEnv({
      gitShow: {
        "origin/main:src/analytics/checkout.ts": gitFileWithExcerptAtLine("track('checkout_clicked')", 18),
      },
    });
    const gateResult = await gate(dir, env);
    expect(gateResult.pass).toBe(true);
    expect(gateResult.levelBefore).toBe("draft");
  });
});

// ---------------------------------------------------------------------------------------------
// dashboard shape: the `mate-doc new --shape dashboard` skeleton, straight from src/shapes/,
// parses, renders every new component (stat delta, inline badge), and lints clean.

describe("golden: dashboard shape skeleton", () => {
  test("parses, renders the stat and badge components, and lints clean", async () => {
    const path = fileURLToPath(new URL("../../src/shapes/dashboard/index.md", import.meta.url));
    const src = await readFile(path, "utf8");
    const doc = parse(src, path);
    expect(doc.errors).toHaveLength(0);

    const html = render(doc, null, { theme: "auto" });
    assertRenderInvariants(html);
    expect(html).toContain('class="tiles"');
    expect(html).toContain('class="badge badge-bad"');
    expect(html).toContain('class="badge badge-good"');
    expect(html).toContain('class="badge badge-warn"');

    const issues = lint([doc], null);
    expect(errorsOf(issues)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Ledger hash is exercised indirectly by gate's official-demotion tests elsewhere; a light
// sanity check here that hashing this suite's docs/ledgers never throws for the golden fixtures.

describe("golden: ledgerHash is stable and total", () => {
  test("hashing golden-guide twice yields the same digest", async () => {
    const dir = join(FIXTURES, "golden-guide");
    const docs = await loadDocs(dir);
    const ledger = await loadLedger(dir);
    const a = ledgerHash(docs, ledger, dir);
    const b = ledgerHash(docs, ledger, dir);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
