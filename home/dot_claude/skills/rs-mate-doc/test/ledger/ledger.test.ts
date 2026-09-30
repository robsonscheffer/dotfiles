import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize, claimHash, ledgerHash, loadLedger, validateLedger } from "../../src/ledger/index.ts";
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
  const docDir = "/docs/checkout";

  test("is deterministic for the same input", () => {
    const docs = [doc(`${docDir}/a.md`)];
    expect(ledgerHash(docs, ledger, docDir)).toBe(ledgerHash(docs, ledger, docDir));
  });

  test("ignores frontmatter status, approved_by, approved_at, ledger_hash", () => {
    const withTrust = doc(`${docDir}/a.md`, {
      frontmatter: {
        title: "Checkout events",
        status: "official",
        approved_by: "Sam",
        approved_at: "2026-09-25",
        ledger_hash: "stale-hash",
        extra: {},
      },
    });
    const withoutTrust = doc(`${docDir}/a.md`, { frontmatter: { title: "Checkout events", extra: {} } });
    expect(ledgerHash([withTrust], ledger, docDir)).toBe(ledgerHash([withoutTrust], ledger, docDir));
  });

  test("changes when the body changes", () => {
    const original = doc(`${docDir}/a.md`);
    const edited = doc(`${docDir}/a.md`, {
      body: [{ type: "paragraph", children: [{ type: "text", value: "Different text.", pos }], pos }],
    });
    expect(ledgerHash([original], ledger, docDir)).not.toBe(ledgerHash([edited], ledger, docDir));
  });

  test("changes when the ledger changes", () => {
    const docs = [doc(`${docDir}/a.md`)];
    const otherLedger: Ledger = {
      path: "claims.yaml",
      claims: [{ id: "C2", claim: "y happened", status: "not_verified", owner: "Sam" }],
    };
    expect(ledgerHash(docs, ledger, docDir)).not.toBe(ledgerHash(docs, otherLedger, docDir));
  });

  test("is stable across doc array ordering", () => {
    const a = doc(`${docDir}/a.md`);
    const b = doc(`${docDir}/b.md`);
    expect(ledgerHash([a, b], ledger, docDir)).toBe(ledgerHash([b, a], ledger, docDir));
  });

  test("ignores position shifts: a paragraph moved down by extra frontmatter lines hashes the same", () => {
    const original = doc(`${docDir}/a.md`);
    const shiftedPos = { start: { line: 40, column: 1 }, end: { line: 40, column: 11 } };
    const shifted = doc(`${docDir}/a.md`, {
      body: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "Body text.", pos: shiftedPos }],
          pos: shiftedPos,
        },
      ],
    });
    expect(ledgerHash([original], ledger, docDir)).toBe(ledgerHash([shifted], ledger, docDir));
  });

  test("ignores the doc folder's absolute location: moving/renaming it keeps the hash", () => {
    const here = [doc(`${docDir}/a.md`), doc(`${docDir}/b.md`)];
    const movedDir = "/somewhere/else/renamed";
    const moved = [doc(`${movedDir}/a.md`), doc(`${movedDir}/b.md`)];
    expect(ledgerHash(here, ledger, docDir)).toBe(ledgerHash(moved, ledger, movedDir));
  });

  test("ignores verdict, checked_by, and checked_at: re-verifying an expired claim does not change the hash", () => {
    const docs = [doc(`${docDir}/a.md`)];
    const freshlyChecked: Ledger = {
      path: "claims.yaml",
      claims: [
        {
          id: "C1",
          claim: "x happened",
          status: "not_verified",
          owner: "Sam",
        },
      ],
    };
    const reVerified: Ledger = {
      path: "claims.yaml",
      claims: [
        {
          ...freshlyChecked.claims[0]!,
          verdict: "supports",
          checked_by: "agent:claude",
          checked_at: "2026-09-25",
        },
      ],
    };
    expect(ledgerHash(docs, freshlyChecked, docDir)).toBe(ledgerHash(docs, reVerified, docDir));
  });

  test("still changes when claim text, status, evidence, ttl_days, or owner change", () => {
    const docs = [doc(`${docDir}/a.md`)];
    const base: Ledger = {
      path: "claims.yaml",
      claims: [
        {
          id: "C1",
          claim: "x happened",
          status: "verified",
          evidence: { kind: "link", url: "https://example.com/x", excerpt: "x happened here", needs: "http" },
          ttl_days: 30,
        },
      ],
    };
    const editedExcerpt: Ledger = {
      path: "claims.yaml",
      claims: [
        {
          ...base.claims[0]!,
          evidence: { ...(base.claims[0]!.evidence as object), excerpt: "a different excerpt" } as never,
        },
      ],
    };
    expect(ledgerHash(docs, base, docDir)).not.toBe(ledgerHash(docs, editedExcerpt, docDir));
  });
});

const linkEvidence = { kind: "link", url: "https://example.com/x", excerpt: "x happened here", needs: "http" } as const;

describe("claimHash", () => {
  const base = { claim: "x happened", evidence: linkEvidence };

  test("is stable across key order", () => {
    const reordered = {
      evidence: { needs: "http", excerpt: "x happened here", url: "https://example.com/x", kind: "link" },
      claim: "x happened",
    };
    expect(claimHash(base as never)).toBe(claimHash(reordered as never));
    expect(claimHash(base as never)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("changes when the claim text or the excerpt changes", () => {
    expect(claimHash({ ...base, claim: "y happened" } as never)).not.toBe(claimHash(base as never));
    expect(claimHash({ ...base, evidence: { ...linkEvidence, excerpt: "other" } } as never)).not.toBe(
      claimHash(base as never),
    );
  });

  test("ignores status, verdict, and checked_by", () => {
    const verdicted = {
      ...base,
      status: "verified",
      verdict: "supports",
      checked_by: "verifier:sonnet",
      checked_at: "2026-09-01",
    };
    expect(claimHash(verdicted as never)).toBe(claimHash(base as never));
  });

  test("treats missing evidence as null", () => {
    expect(claimHash({ claim: "x" } as never)).toBe(claimHash({ claim: "x", evidence: undefined } as never));
  });
});

describe("ledgerHash and verdict fields", () => {
  test("does not change when only verdict_hash or verdict_reason is added", () => {
    const docDir = "/tmp/acme-docs";
    const docs = [doc(`${docDir}/a.md`)];
    const claim = { id: "C1", claim: "x happened", status: "verified", evidence: linkEvidence } as const;
    const before: Ledger = { path: "claims.yaml", claims: [claim as never] };
    const after: Ledger = {
      path: "claims.yaml",
      claims: [{ ...claim, verdict_hash: "abc", verdict_reason: "excerpt matches" } as never],
    };
    expect(ledgerHash(docs, after, docDir)).toBe(ledgerHash(docs, before, docDir));
  });
});

describe("author", () => {
  test("loadLedger exposes the top-level author", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "claims.yaml"), "author: human:Alex\nclaims: []\n");
    expect((await loadLedger(dir))?.author).toBe("human:Alex");
  });
});
