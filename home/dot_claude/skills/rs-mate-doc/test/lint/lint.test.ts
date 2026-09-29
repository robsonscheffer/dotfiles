import { describe, expect, test } from "bun:test";
import { lint } from "../../src/lint/index.ts";
import type { Doc, Ledger, LintIssue } from "../../src/types.ts";

const pos = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };

function baseDoc(overrides: Partial<Doc> = {}): Doc {
  return {
    path: "guide/checkout.md",
    frontmatter: { title: "Checkout", extra: {} },
    body: [],
    headings: [],
    claimRefs: [],
    errors: [],
    ...overrides,
  };
}

function textParagraph(value: string) {
  return { type: "paragraph" as const, children: [{ type: "text" as const, value, pos }], pos };
}

function rulesOf(issues: LintIssue[]): string[] {
  return issues.map((i) => i.rule);
}

const ledgerWithC7: Ledger = {
  path: "guide/claims.yaml",
  claims: [{ id: "C7", claim: "x", status: "verified", evidence: { kind: "link", url: "https://example.com", needs: "http" }, verdict: "supports", checked_by: "agent:claude", checked_at: "2026-09-25" }],
};

describe("lint: claim-unresolved", () => {
  test("flags a claimRef with no matching ledger claim", () => {
    const doc = baseDoc({
      body: [{ type: "paragraph", children: [{ type: "text", value: "Orders sync fast. ", pos }, { type: "claimRef", id: "C99", pos }], pos }],
      claimRefs: [{ type: "claimRef", id: "C99", pos }],
    });
    const issues = lint([doc], ledgerWithC7);
    expect(rulesOf(issues)).toContain("claim-unresolved");
  });

  test("passes when the claimRef matches a ledger claim", () => {
    const doc = baseDoc({
      body: [{ type: "paragraph", children: [{ type: "text", value: "Orders sync fast. ", pos }, { type: "claimRef", id: "C7", pos }], pos }],
      claimRefs: [{ type: "claimRef", id: "C7", pos }],
    });
    const issues = lint([doc], ledgerWithC7);
    expect(rulesOf(issues)).not.toContain("claim-unresolved");
  });
});

describe("lint: em-dash", () => {
  test("flags an em-dash in prose", () => {
    const doc = baseDoc({ body: [textParagraph("Fast \u2014 not instant.")] });
    expect(rulesOf(lint([doc], null))).toContain("em-dash");
  });

  test("passes plain prose with a hyphen", () => {
    const doc = baseDoc({ body: [textParagraph("Fast - not instant.")] });
    expect(rulesOf(lint([doc], null))).not.toContain("em-dash");
  });
});

describe("lint: private-path", () => {
  test("flags a wiki/ path", () => {
    const doc = baseDoc({ body: [textParagraph("See wiki/decision/2026-plan.md for context.")] });
    expect(rulesOf(lint([doc], null))).toContain("private-path");
  });

  test("flags a ~/brain path", () => {
    const doc = baseDoc({ body: [textParagraph("Stored at ~/brain/projects/x.")] });
    expect(rulesOf(lint([doc], null))).toContain("private-path");
  });

  test("passes a normal repo path", () => {
    const doc = baseDoc({ body: [textParagraph("See src/analytics/label.ts for the source.")] });
    expect(rulesOf(lint([doc], null))).not.toContain("private-path");
  });
});

describe("lint: localhost-url", () => {
  test("flags a localhost URL", () => {
    const doc = baseDoc({ body: [textParagraph("Open http://localhost:52010/artifacts/x to view it.")] });
    expect(rulesOf(lint([doc], null))).toContain("localhost-url");
  });

  test("passes a public URL", () => {
    const doc = baseDoc({ body: [textParagraph("Open https://example.com/x to view it.")] });
    expect(rulesOf(lint([doc], null))).not.toContain("localhost-url");
  });
});

describe("lint: unknown-directive", () => {
  test("flags a directive name outside the known set", () => {
    const doc = baseDoc({ body: [{ type: "directive", name: "wobble", known: false, args: [], children: [], pos }] });
    expect(rulesOf(lint([doc], null))).toContain("unknown-directive");
  });

  test("passes a known directive", () => {
    const doc = baseDoc({ body: [{ type: "directive", name: "warn", known: true, args: [], children: [], pos }] });
    expect(rulesOf(lint([doc], null))).not.toContain("unknown-directive");
  });
});

describe("lint: parse-error", () => {
  test("surfaces every doc.errors entry", () => {
    const doc = baseDoc({ errors: [{ type: "error", message: "directive :::means is never closed", children: [], pos }] });
    const issues = lint([doc], null);
    expect(rulesOf(issues)).toContain("parse-error");
    expect(issues.find((i) => i.rule === "parse-error")?.message).toBe("directive :::means is never closed");
  });
});

describe("lint: unclaimed-fact (warn)", () => {
  test("warns on a sentence with a number and no claim ref", () => {
    const doc = baseDoc({ body: [textParagraph("918 people qualify for the credit.")] });
    const issues = lint([doc], null);
    const issue = issues.find((i) => i.rule === "unclaimed-fact");
    expect(issue?.severity).toBe("warn");
  });

  test("does not warn when the paragraph carries a claim ref", () => {
    const doc = baseDoc({
      body: [{ type: "paragraph", children: [{ type: "text", value: "918 people qualify for the credit. ", pos }, { type: "claimRef", id: "C7", pos }], pos }],
    });
    expect(rulesOf(lint([doc], ledgerWithC7))).not.toContain("unclaimed-fact");
  });

  test("does not warn on prose with no numbers or code", () => {
    const doc = baseDoc({ body: [textParagraph("People qualify for the credit.")] });
    expect(rulesOf(lint([doc], null))).not.toContain("unclaimed-fact");
  });
});

describe("lint: badge-tone (warn)", () => {
  const badgePos = { start: { line: 4, column: 3 }, end: { line: 4, column: 3 } };

  function badgeParagraph(value: string) {
    return { type: "paragraph" as const, children: [{ type: "text" as const, value, pos: badgePos }], pos: badgePos };
  }

  test("warns on an unknown tone at the text node's position", () => {
    const doc = baseDoc({ body: [badgeParagraph("Rollout is :badge[Blocked]{tone=urgent} pending review.")] });
    const issues = lint([doc], null);
    const issue = issues.find((i) => i.rule === "badge-tone");
    expect(issue?.severity).toBe("warn");
    expect(issue?.pos).toEqual(badgePos);
  });

  for (const tone of ["good", "warn", "bad", "info", "neutral"]) {
    test(`does not warn on the valid tone "${tone}"`, () => {
      const doc = baseDoc({ body: [textParagraph(`Rollout is :badge[Blocked]{tone=${tone}} pending review.`)] });
      expect(rulesOf(lint([doc], null))).not.toContain("badge-tone");
    });
  }

  test("does not warn on a badge with no tone attribute", () => {
    const doc = baseDoc({ body: [textParagraph("Rollout is :badge[Blocked] pending review.")] });
    expect(rulesOf(lint([doc], null))).not.toContain("badge-tone");
  });
});

describe("lint: ledger shape rules", () => {
  test("flags not_verified without an owner", () => {
    const ledger: Ledger = { path: "claims.yaml", claims: [{ id: "C1", claim: "x", status: "not_verified" }] };
    expect(rulesOf(lint([], ledger))).toContain("not-verified-without-owner");
  });

  test("flags a verified claim missing evidence as claim-incomplete", () => {
    const ledger: Ledger = { path: "claims.yaml", claims: [{ id: "C1", claim: "x", status: "verified", checked_by: "agent:claude", checked_at: "2026-09-25" } as never] };
    expect(rulesOf(lint([], ledger))).toContain("claim-incomplete");
  });

  test("passes a well-formed ledger", () => {
    expect(lint([], ledgerWithC7)).toHaveLength(0);
  });
});

describe("lint: secret and PII in evidence excerpts", () => {
  test("flags an AWS-key-shaped secret in a code excerpt", () => {
    const ledger: Ledger = {
      path: "claims.yaml",
      claims: [
        {
          id: "C1",
          claim: "x",
          status: "verified",
          evidence: { kind: "code", ref: "acme/web@main:a.ts:1", excerpt: "const key = 'AKIAEXAMPLE1234567X'", needs: "git" },
          verdict: "supports",
          checked_by: "agent:claude",
          checked_at: "2026-09-25",
        },
      ],
    };
    expect(rulesOf(lint([], ledger))).toContain("secret-in-excerpt");
  });

  test("flags an email-shaped PII in a link excerpt", () => {
    const ledger: Ledger = {
      path: "claims.yaml",
      claims: [
        {
          id: "C1",
          claim: "x",
          status: "verified",
          evidence: { kind: "link", url: "https://example.com", excerpt: "contact person@example.com", needs: "http" },
          verdict: "supports",
          checked_by: "agent:claude",
          checked_at: "2026-09-25",
        },
      ],
    };
    expect(rulesOf(lint([], ledger))).toContain("pii-in-excerpt");
  });

  test("passes a clean excerpt", () => {
    const ledger: Ledger = {
      path: "claims.yaml",
      claims: [
        {
          id: "C1",
          claim: "x",
          status: "verified",
          evidence: { kind: "link", url: "https://example.com", excerpt: "Self-serve starts at $40/month.", needs: "http" },
          verdict: "supports",
          checked_by: "agent:claude",
          checked_at: "2026-09-25",
        },
      ],
    };
    const issues = lint([], ledger);
    expect(rulesOf(issues)).not.toContain("secret-in-excerpt");
    expect(rulesOf(issues)).not.toContain("pii-in-excerpt");
  });
});
