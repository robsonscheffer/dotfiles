import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLedger, validateLedger } from "../../src/ledger/index.ts";
import { lint } from "../../src/lint/index.ts";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import type { Claim, Ledger } from "../../src/types.ts";
import { composeWalk } from "../../src/walk/compose.ts";
import { FETCHED_PR, WALK_INPUTS } from "./fixture.ts";

const NOW = new Date("2026-09-25T00:00:00Z");

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mate-doc-walk-"));
}

function claimsFromYaml(yamlText: string): Claim[] {
  const parsed = Bun.YAML.parse(yamlText) as { claims?: Claim[] } | null;
  return parsed?.claims ?? [];
}

describe("composeWalk", () => {
  test("produces exactly index.md and claims.yaml", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    expect(Object.keys(composed.files).sort()).toEqual(["claims.yaml", "index.md"]);
  });

  test("frontmatter marks the doc as a draft walk", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    const md = composed.files["index.md"]!;
    expect(md).toMatch(/^---\n/);
    expect(md).toContain("shape: walk");
    expect(md).toContain("status: draft");
  });

  test("section order matches rs-walk: story, diff groups, ticket fit, questions, risks, prior discussion, judgment", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    const md = composed.files["index.md"]!;
    const markers = ["## The story", "## 01.", "## 02.", "## 03.", "## 04.", "## Ticket fit", "## Bring your questions", "## Risks", "## Prior discussion", "## Judgment"];
    let cursor = -1;
    for (const marker of markers) {
      const idx = md.indexOf(marker);
      expect(idx).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  test("comment triage never appears before the judgment, and the judgment sits inside a <details>", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    const md = composed.files["index.md"]!;
    const triageIdx = md.indexOf("## Prior discussion");
    const judgmentIdx = md.indexOf("## Judgment");
    expect(triageIdx).toBeGreaterThan(-1);
    expect(judgmentIdx).toBeGreaterThan(triageIdx);
    const judgmentSection = md.slice(judgmentIdx);
    expect(judgmentSection).toContain("<details>");
    expect(judgmentSection.indexOf("<details>")).toBeLessThan(judgmentSection.indexOf("Overall"));
  });

  test("the composed index.md parses with zero parse errors", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    const doc = parse(composed.files["index.md"]!, "index.md");
    expect(doc.errors).toHaveLength(0);
  });

  test("lint on the folder has zero errors", async () => {
    const dir = await tempDir();
    try {
      const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
      await Bun.write(join(dir, "index.md"), composed.files["index.md"]!);
      await Bun.write(join(dir, "claims.yaml"), composed.files["claims.yaml"]!);

      const doc = parse(composed.files["index.md"]!, "index.md");
      const ledger = await loadLedger(dir);
      expect(ledger).not.toBeNull();
      expect(validateLedger(ledger!).valid).toBe(true);

      const issues = lint([doc], ledger);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("renders with no http(s) resource URLs and no em-dash", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    const doc = parse(composed.files["index.md"]!, "index.md");
    const ledger: Ledger = { path: "claims.yaml", claims: claimsFromYaml(composed.files["claims.yaml"]!) };
    const html = render(doc, ledger, { theme: "auto" });

    expect(html).not.toContain("\u2014");
    // "Resource" URLs - things the page would fetch to render - not a plain <a href> hyperlink.
    expect(/<(script|link)\b[^>]*\b(?:src|href)=["']https?:/i.test(html)).toBe(false);
    expect(/@import\s+url\(["']?https?:/i.test(html)).toBe(false);
  });

  test("every diff statement with an excerpt is a verified code claim; every other one is not_verified with an owner", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);

    const notVerified = claims.filter((c) => c.status === "not_verified");
    expect(notVerified.length).toBeGreaterThan(0); // group 2's file has no diff entry in the fixture
    for (const c of notVerified) {
      expect(c.owner).toBeTruthy();
      expect(c.evidence).toBeUndefined();
    }

    const verifiedCode = claims.filter((c) => c.status === "verified" && c.evidence?.kind === "code");
    expect(verifiedCode.length).toBeGreaterThan(0);
    for (const c of verifiedCode) {
      expect(c.evidence?.kind).toBe("code");
      if (c.evidence?.kind === "code") expect(c.evidence.excerpt.length).toBeGreaterThan(0);
      expect(c.checked_by).toBeTruthy();
      expect(c.checked_at).toBe("2026-09-25");
    }
  });

  test("ticket-fit acceptance criteria with evidence are verified mcp claims; the rest are not_verified", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    const mcpClaims = claims.filter((c) => c.evidence?.kind === "mcp");
    expect(mcpClaims).toHaveLength(1); // only one of the fixture's three AC rows carries evidence
    for (const c of mcpClaims) {
      expect(c.status).toBe("verified");
      if (c.evidence?.kind === "mcp") expect(c.evidence.needs).toBe("mcp:jira");
    }

    const acCriteria = new Set(WALK_INPUTS.ticketFit!.acceptance_criteria.filter((ac) => ac.evidence.trim().length === 0).map((ac) => ac.criterion));
    const acNotVerified = claims.filter((c) => c.status === "not_verified" && acCriteria.has(c.claim));
    expect(acNotVerified).toHaveLength(acCriteria.size);
    for (const c of acNotVerified) expect(c.owner).toBeTruthy();
  });

  test("is deterministic for the same inputs and now", () => {
    const a = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    const b = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    expect(a.files["index.md"]).toBe(b.files["index.md"]);
    expect(a.files["claims.yaml"]).toBe(b.files["claims.yaml"]);
  });

  test("omitting ticket fit and comment triage renders the documented empty states, with no claims from either", () => {
    const inputs = { ...WALK_INPUTS, ticketFit: undefined, commentTriage: undefined };
    const composed = composeWalk(FETCHED_PR, inputs, { now: NOW });
    const md = composed.files["index.md"]!;
    expect(md).toContain("No ticket linked to this PR.");
    expect(md).toContain("No comments or reviews yet.");

    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    expect(claims.some((c) => c.evidence?.kind === "mcp")).toBe(false);

    const doc = parse(md, "index.md");
    expect(doc.errors).toHaveLength(0);
  });
});
