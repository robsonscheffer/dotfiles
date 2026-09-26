import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize, ledgerHash, loadLedger, validateLedger } from "../../src/ledger/index.ts";
import type { Doc, Ledger } from "../../src/types.ts";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mate-doc-ledger-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const pos = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
function doc(path: string, overrides: Partial<Doc> = {}): Doc {
  return {
    path,
    frontmatter: { title: "Checkout events", extra: {} },
    body: [{ type: "paragraph", children: [{ type: "text", value: "Body text.", pos }], pos }],
    headings: [],
    claimRefs: [],
    errors: [],
    ...overrides,
  };
}

describe("loadLedger", () => {
  test("returns null when claims.yaml does not exist", async () => {
    const dir = await tempDir();
    expect(await loadLedger(dir)).toBeNull();
  });

  test("loads claims from YAML, keeping dates as strings", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, "claims.yaml"),
      [
        "claims:",
        "  - id: C1",
        "    claim: Checkout is instrumented.",
        "    status: verified",
        "    evidence:",
        "      kind: link",
        "      url: https://example.com/orders/checkout",
        "      needs: http",
        "    verdict: supports",
        "    checked_by: agent:claude",
        "    checked_at: 2026-09-25",
        "    ttl_days: 30",
      ].join("\n"),
    );
    const ledger = await loadLedger(dir);
    expect(ledger?.claims).toHaveLength(1);
    expect(ledger?.claims[0]?.id).toBe("C1");
    expect(typeof ledger?.claims[0]?.checked_at).toBe("string");
    expect(ledger?.path).toBe(join(dir, "claims.yaml"));
  });
});

describe("validateLedger", () => {
  test("accepts a well-formed ledger", () => {
    const ledger: Ledger = {
      path: "claims.yaml",
      claims: [{ id: "C1", claim: "x happened", status: "not_verified", owner: "Sam" }],
    };
    expect(validateLedger(ledger).valid).toBe(true);
  });

  test("rejects not_verified without an owner", () => {
    const ledger: Ledger = {
      path: "claims.yaml",
      claims: [{ id: "C1", claim: "x happened", status: "not_verified" }],
    };
    const result = validateLedger(ledger);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("canonicalize", () => {
  test("sorts object keys, ignoring insertion order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  test("keeps array order", () => {
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]));
  });

  test("drops undefined values so their absence and presence hash the same", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });
});

describe("ledgerHash", () => {
  const ledger: Ledger = {
    path: "claims.yaml",
    claims: [{ id: "C1", claim: "x happened", status: "not_verified", owner: "Sam" }],
  };

  test("is deterministic for the same input", () => {
    const docs = [doc("a.md")];
    expect(ledgerHash(docs, ledger)).toBe(ledgerHash(docs, ledger));
  });

  test("ignores frontmatter status, approved_by, approved_at, ledger_hash", () => {
    const withTrust = doc("a.md", {
      frontmatter: {
        title: "Checkout events",
        status: "official",
        approved_by: "Sam",
        approved_at: "2026-09-25",
        ledger_hash: "stale-hash",
        extra: {},
      },
    });
    const withoutTrust = doc("a.md", { frontmatter: { title: "Checkout events", extra: {} } });
    expect(ledgerHash([withTrust], ledger)).toBe(ledgerHash([withoutTrust], ledger));
  });

  test("changes when the body changes", () => {
    const original = doc("a.md");
    const edited = doc("a.md", {
      body: [{ type: "paragraph", children: [{ type: "text", value: "Different text.", pos }], pos }],
    });
    expect(ledgerHash([original], ledger)).not.toBe(ledgerHash([edited], ledger));
  });

  test("changes when the ledger changes", () => {
    const docs = [doc("a.md")];
    const otherLedger: Ledger = {
      path: "claims.yaml",
      claims: [{ id: "C2", claim: "y happened", status: "not_verified", owner: "Sam" }],
    };
    expect(ledgerHash(docs, ledger)).not.toBe(ledgerHash(docs, otherLedger));
  });

  test("is stable across doc array ordering", () => {
    const a = doc("a.md");
    const b = doc("b.md");
    expect(ledgerHash([a, b], ledger)).toBe(ledgerHash([b, a], ledger));
  });
});
