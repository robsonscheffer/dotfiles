import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../../src/cli.ts";
import { loadLedger, validateLedger } from "../../src/ledger/index.ts";
import { lint } from "../../src/lint/index.ts";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import type { Claim, Ledger } from "../../src/types.ts";
import { composeWalk } from "../../src/walk/compose.ts";
import { FETCHED_PR, WALK_INPUTS } from "./fixture.ts";

const NOW = new Date("2026-09-25T00:00:00Z");
const AUTHOR = "agent:claude";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mate-doc-walk-"));
}

function claimsFromYaml(yamlText: string): Claim[] {
  const parsed = Bun.YAML.parse(yamlText) as { claims?: Claim[] } | null;
  return parsed?.claims ?? [];
}

describe("composeWalk", () => {
  test("produces exactly index.md and claims.yaml", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    expect(Object.keys(composed.files).sort()).toEqual(["claims.yaml", "index.md"]);
  });

  test("frontmatter marks the doc as a draft walk", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const md = composed.files["index.md"]!;
    expect(md).toMatch(/^---\n/);
    expect(md).toContain("shape: walk");
    expect(md).toContain("status: draft");
  });

  test("frontmatter opts the walk into per-section notes", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const md = composed.files["index.md"]!;
    expect(md).toContain("notes: true");
  });

  test("frontmatter carries the home index's kind, pr, verdict, and updated fields", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const md = composed.files["index.md"]!;
    expect(md).toContain("kind: walk");
    expect(md).toContain(`pr: "${FETCHED_PR.repo}#${FETCHED_PR.meta.number}"`);
    expect(md).toContain('verdict: ""');
    expect(md).toContain("updated: 2026-09-25");
  });

  test("section order matches rs-walk: story, diff groups, ticket fit, questions, risks, prior discussion, judgment", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const md = composed.files["index.md"]!;
    const markers = ["## The story", "## 01.", "## 02.", "## 03.", "## 04.", "## Ticket fit", "## Bring your questions", "## Risks", "## Prior discussion", "## Judgment"];
    let cursor = -1;
    for (const marker of markers) {
      const idx = md.indexOf(marker);
      expect(idx).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  test("comment triage never appears before the judgment, and the judgment is sealed", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const md = composed.files["index.md"]!;
    const triageIdx = md.indexOf("## Prior discussion");
    const judgmentIdx = md.indexOf("## Judgment");
    expect(triageIdx).toBeGreaterThan(-1);
    expect(judgmentIdx).toBeGreaterThan(triageIdx);
    const judgmentSection = md.slice(judgmentIdx);
    expect(judgmentSection).toContain(`:::sealed ${WALK_INPUTS.judgment.overall} strong solid cautious concern`);
    expect(judgmentSection.indexOf(":::sealed")).toBeLessThan(judgmentSection.indexOf("Overall"));
  });

  test("the composed index.md parses with zero parse errors", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const doc = parse(composed.files["index.md"]!, "index.md");
    expect(doc.errors).toHaveLength(0);
  });

  test("lint on the folder has zero errors", async () => {
    const dir = await tempDir();
    try {
      const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
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
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const doc = parse(composed.files["index.md"]!, "index.md");
    const ledger: Ledger = { path: "claims.yaml", claims: claimsFromYaml(composed.files["claims.yaml"]!) };
    const html = render(doc, ledger, { theme: "auto" });

    expect(html).not.toContain("\u2014");
    // "Resource" URLs - things the page would fetch to render - not a plain <a href> hyperlink.
    expect(/<(script|link)\b[^>]*\b(?:src|href)=["']https?:/i.test(html)).toBe(false);
    expect(/@import\s+url\(["']?https?:/i.test(html)).toBe(false);
  });

  test("a group with a matching added-line anchor gives a proposed code claim at the head SHA", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    const c = claims.find((x) => x.claim === WALK_INPUTS.story.groups[0]!.framing)!;
    expect(c.status).toBe("proposed");
    expect(c.ttl_days).toBe(14);
    expect(c.owner).toBeUndefined();
    expect(c.evidence?.kind).toBe("code");
    if (c.evidence?.kind !== "code") throw new Error("expected code evidence");
    expect(c.evidence.excerpt).toBe("import { useSession } from '@shared/providers/SessionProvider';");
    expect(c.evidence.needs).toBe("gh");
    const m = /^acme\/console@([0-9a-f]+):src\/shared\/analytics\/routeTracking\.ts:(\d+)$/.exec(c.evidence.ref);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(FETCHED_PR.meta.headRefOid);
    // The import is the second line of its hunk, so the line is hunk start + 1 (context line, then removed, then added).
    const hunkStart = /@@ -(\d+),9 \+(\d+),7 @@/.exec(FETCHED_PR.diff.split("routeTracking.ts b/")[1]!.split("\n").find((l) => l.startsWith("@@"))!)!;
    expect(Number(m![2])).toBe(Number(hunkStart[2]) + 1);
  });

  test("an anchor that matches only a removed line gives a ref at the base SHA", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    const c = claims.find((x) => x.claim === WALK_INPUTS.story.groups[3]!.framing)!;
    expect(c.status).toBe("proposed");
    if (c.evidence?.kind !== "code") throw new Error("expected code evidence");
    expect(c.evidence.ref).toContain(`@${FETCHED_PR.meta.baseRefOid}:`);
    expect(c.evidence.excerpt).toBe("const user = useSelector((state) => state.session.currentUser);");
  });

  test("an unmatched anchor gives not_verified with an owner and one warning", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    const c = claims.find((x) => x.claim === WALK_INPUTS.story.groups[1]!.framing)!;
    expect(c.status).toBe("not_verified");
    expect(c.owner).toBe("sam");
    expect(c.evidence).toBeUndefined();
    expect(composed.warnings).toEqual([`group 02 "The redirectTo/navigate rabbit hole": no anchor matched the diff; claim ${c.id} is not_verified`]);
  });

  test("only the first matching anchor backs a claim; later anchors warn", () => {
    const first = WALK_INPUTS.story.groups[0]!.anchors![0]!;
    const second = WALK_INPUTS.story.groups[3]!.anchors![0]!;
    const missing = { file: first.file, excerpt: "no such line anywhere" };
    const build = (extra: typeof first) => {
      const groups = WALK_INPUTS.story.groups.map((g, i) => (i === 0 ? { ...g, files: [...g.files, extra.file], anchors: [first, extra] } : g));
      return composeWalk(FETCHED_PR, { ...WALK_INPUTS, story: { ...WALK_INPUTS.story, groups } }, { now: NOW, author: AUTHOR });
    };
    const title = WALK_INPUTS.story.groups[0]!.title;
    const used = build(second);
    const claim = claimsFromYaml(used.files["claims.yaml"]!).find((x) => x.claim === WALK_INPUTS.story.groups[0]!.framing)!;
    if (claim.evidence?.kind !== "code") throw new Error("expected code evidence");
    expect(claim.evidence.excerpt).toBe(first.excerpt);
    expect(used.warnings.filter((w) => w.includes("anchor 2"))).toEqual([
      `group 01 "${title}": anchor 2 (${second.file}) not used; one claim uses one anchor, split the framing to back more lines`,
    ]);
    const unmatched = build(missing);
    expect(unmatched.warnings).toContain(`group 01 "${title}": anchor 2 (${first.file}) did not match the diff`);
  });

  test("a group with framing but no anchors is not_verified", () => {
    const groups = WALK_INPUTS.story.groups.map((g, i) => (i === 0 ? { ...g, anchors: undefined } : g));
    const inputs = { ...WALK_INPUTS, story: { ...WALK_INPUTS.story, groups } };
    const composed = composeWalk(FETCHED_PR, inputs, { now: NOW, author: AUTHOR });
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    expect(claims.find((x) => x.claim === groups[0]!.framing)?.status).toBe("not_verified");
    expect(composed.warnings).toHaveLength(2);
  });

  test("a group with no framing gets no claim and no marker; ids stay sequential", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const md = composed.files["index.md"]!;
    const section = md.slice(md.indexOf("## 03."), md.indexOf("## 04."));
    expect(section).not.toMatch(/\{C\d+\}/);
    expect(section).toContain("**The payoff commit**");
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    expect(claims.map((c) => c.id)).toEqual(["C1", "C2", "C3", "C4", "C5", "C6"]);
  });

  test("Met with a matching ref is a proposed code claim; other statuses are not_verified", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    const met = claims.find((c) => c.claim === "Portal boots with no global store")!;
    expect(met.status).toBe("proposed");
    expect(met.ttl_days).toBe(14);
    expect(met.evidence?.kind).toBe("code");
    const partial = claims.find((c) => c.claim === "No regression in the impersonation flow")!;
    expect(partial.status).toBe("not_verified");
    expect(partial.owner).toBe("sam");
    expect(claims.find((c) => c.claim === "Shared layer stays backward-compatible for other consumers")?.status).toBe("not_verified");
    expect(met.role).toBe("criterion");
    expect(partial.role).toBe("criterion");
    // The ticket-fit table still shows the agent's own evidence prose.
    expect(composed.files["index.md"]).toContain("index.tsx no longer creates a store");
  });

  test("Met with refs that do not match is not_verified and warns", () => {
    const ticketFit = structuredClone(WALK_INPUTS.ticketFit!);
    ticketFit.acceptance_criteria[0]!.refs = [{ file: "src/apps/portal/index.tsx", excerpt: "no such line anywhere" }];
    const composed = composeWalk(FETCHED_PR, { ...WALK_INPUTS, ticketFit }, { now: NOW, author: AUTHOR });
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    expect(claims.find((c) => c.claim === "Portal boots with no global store")?.status).toBe("not_verified");
    expect(composed.warnings.some((w) => w.startsWith('criterion "Portal boots with no global store"'))).toBe(true);
  });

  test("compose never writes verified, mcp evidence, checked_by, or checked_at", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    expect(claims.length).toBeGreaterThan(0);
    for (const c of claims) {
      expect(c.status === "proposed" || c.status === "not_verified").toBe(true);
      expect(c.evidence?.kind).not.toBe("mcp");
      expect(c.checked_by).toBeUndefined();
      expect(c.checked_at).toBeUndefined();
      if (c.status === "not_verified") expect(c.owner).toBeTruthy();
    }
  });

  test("claims.yaml starts with the author and loadLedger reads it", async () => {
    const dir = await tempDir();
    try {
      const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
      expect(composed.files["claims.yaml"]!.startsWith('author: "agent:claude"\nclaims:\n')).toBe(true);
      await Bun.write(join(dir, "claims.yaml"), composed.files["claims.yaml"]!);
      const ledger = await loadLedger(dir);
      expect(ledger?.author).toBe("agent:claude");
      expect(validateLedger(ledger!).valid).toBe(true);
      const empty = composeWalk(FETCHED_PR, { ...WALK_INPUTS, story: { ...WALK_INPUTS.story, groups: [] }, ticketFit: undefined }, { now: NOW, author: AUTHOR });
      expect(empty.files["claims.yaml"]).toBe('author: "agent:claude"\nclaims: []\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("claims.yaml is block-style, so `mate-doc verdict` can edit a composed claim in place", async () => {
    const dir = await tempDir();
    try {
      const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
      await Bun.write(join(dir, "index.md"), composed.files["index.md"]!);
      await Bun.write(join(dir, "claims.yaml"), composed.files["claims.yaml"]!);

      const before = claimsFromYaml(composed.files["claims.yaml"]!);
      const targetId = before[0]!.id;

      const code = await main(["verdict", dir, targetId, "--overstates"]);
      expect(code).toBe(0);

      const raw = await readFile(join(dir, "claims.yaml"), "utf8");
      const ledger = await loadLedger(dir);
      expect(ledger).not.toBeNull();
      expect(validateLedger(ledger!).valid).toBe(true);

      const target = ledger!.claims.find((c) => c.id === targetId);
      expect(target?.verdict).toBe("overstates");
      expect(target?.checked_by).toMatch(/^agent:/);
      // Every other claim's own line-count survives the surgical edit untouched.
      expect(ledger!.claims).toHaveLength(before.length);
      expect(raw).toContain(`  - id: ${targetId}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("every code ref resolves against the PR head commit, not a pull-request revision", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    const codeClaims = claims.filter((c) => c.evidence?.kind === "code");
    expect(codeClaims.length).toBeGreaterThan(0);
    for (const c of codeClaims) {
      if (c.evidence?.kind !== "code") continue;
      expect(c.evidence.ref).toMatch(/@[0-9a-f]{7,40}:/);
      expect(c.evidence.ref).not.toContain("@pr");
      expect(c.ttl_days).toBe(14);
    }
  });

  test("is deterministic for the same inputs and now", () => {
    const a = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const b = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    expect(a.files["index.md"]).toBe(b.files["index.md"]);
    expect(a.files["claims.yaml"]).toBe(b.files["claims.yaml"]);
  });

  test("related notes render as wikilinks with no private paths, and lint passes", async () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const md = composed.files["index.md"]!;
    expect(md).toContain("## Related notes");
    expect(md).toContain("[[store-teardown-order]]");
    expect(md).toContain("[[session-provider-migration]]");
    expect(md).not.toContain("wiki/");
    expect(md).not.toContain("~/brain");

    const dir = await tempDir();
    try {
      await Bun.write(join(dir, "index.md"), md);
      await Bun.write(join(dir, "claims.yaml"), composed.files["claims.yaml"]!);
      const doc = parse(md, "index.md");
      const ledger = await loadLedger(dir);
      const issues = lint([doc], ledger);
      expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("a related note stored as a folder's index.md is named after its folder", () => {
    const inputs = { ...WALK_INPUTS, context: { mode: "qmd" as const, items: ["walks/pr-42/index.md"] } };
    const md = composeWalk(FETCHED_PR, inputs, { now: NOW, author: AUTHOR }).files["index.md"]!;
    expect(md).toContain("[[pr-42]]");
    expect(md).not.toContain("[[index]]");
  });

  test("omitting context renders no related-notes section", () => {
    const inputs = { ...WALK_INPUTS, context: undefined };
    const composed = composeWalk(FETCHED_PR, inputs, { now: NOW, author: AUTHOR });
    expect(composed.files["index.md"]).not.toContain("## Related notes");
  });

  test("omitting ticket fit and comment triage renders the documented empty states, with no claims from either", () => {
    const inputs = { ...WALK_INPUTS, ticketFit: undefined, commentTriage: undefined };
    const composed = composeWalk(FETCHED_PR, inputs, { now: NOW, author: AUTHOR });
    const md = composed.files["index.md"]!;
    expect(md).toContain("No ticket linked to this PR.");
    expect(md).toContain("No comments or reviews yet.");

    const claims = claimsFromYaml(composed.files["claims.yaml"]!);
    expect(claims.some((c) => c.evidence?.kind === "mcp")).toBe(false);

    const doc = parse(md, "index.md");
    expect(doc.errors).toHaveLength(0);
  });
});
