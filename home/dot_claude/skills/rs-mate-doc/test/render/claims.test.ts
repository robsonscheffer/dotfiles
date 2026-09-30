import { describe, expect, test } from "bun:test";
import { CLAIM_PANEL_SCRIPT } from "../../src/render/claims.ts";
import { render } from "../../src/render/index.ts";
import { THEME_CSS } from "../../src/render/theme.ts";
import type { Claim, ClaimId, ClaimStatus, Verdict } from "../../src/types.ts";
import { claimRef, makeClaim, makeDoc, makeLedger, para, table, text } from "./helpers.ts";

function page(ids: ClaimId[], claims: Claim[], body?: ReturnType<typeof para>[]) {
  const doc = makeDoc(body ?? [para(text("Intro."), ...ids.map(claimRef))], { title: "Doc" });
  doc.claimRefs = ids.map(claimRef);
  return render(doc, makeLedger(claims), { theme: "auto" });
}

const full = makeClaim({
  id: "C1",
  claim: "Labels come from the nearest attribute.",
  status: "verified",
  verdict: "supports",
  verdict_reason: "The excerpt shows the lookup.",
  checked_by: "verifier:sonnet",
  checked_at: "2026-09-25",
  evidence: { kind: "code", ref: "acme/widgets@main:src/label.ts:42", excerpt: "const label = attr", needs: "git" },
});

describe("claim markers and Claims list", () => {
  test("marker links to a matching row and has no title", () => {
    const html = page(["C1"], [full]);
    expect(html).toContain('href="#claim-C1"');
    expect(html).toContain('id="claim-C1"');
    expect(html).toContain('aria-label="Claim C1: Labels come from the nearest attribute."');
    expect(html).not.toMatch(/title="Labels/);
    expect(html).not.toMatch(/class="claim-marker[^>]*title=/);
  });

  test("a marker in a table cell gets a full row in the Claims list", () => {
    const html = page(["C1"], [full], [table([[text("A")]], [[[text("cell"), claimRef("C1")]]]) as never]);
    const list = html.slice(html.indexOf('id="mate-doc-claims"'));
    for (const s of ["const label = attr", "acme/widgets@main:src/label.ts:42", "verifier:sonnet", "The excerpt shows the lookup.", "verdict-supports", "2026-09-25"]) {
      expect(list).toContain(s);
    }
  });

  test("a missing id gives a claim-missing marker and a not-in-the-ledger row", () => {
    const html = page(["C99"], []);
    expect(html).toContain("claim-marker claim-missing");
    expect(html).toContain('id="claim-C99"');
    expect(html).toContain("C99 is not in the ledger");
  });

  test("repeated refs give one row; unreferenced ledger claims give none", () => {
    const other = makeClaim({ id: "C2", claim: "Other." });
    const html = page(["C1", "C1"], [full, other]);
    expect(html.match(/id="claim-C1"/g)?.length).toBe(1);
    expect(html).not.toContain('id="claim-C2"');
  });

  test("no refs: no Claims section and no panel script", () => {
    const html = page([], [full], [para(text("Plain."))]);
    expect(html).not.toContain("mate-doc-claims");
    expect(html).not.toContain(CLAIM_PANEL_SCRIPT);
  });

  const statuses: ClaimStatus[] = ["verified", "inferred", "proposed", "not_verified"];
  for (const status of statuses) {
    test(`status ${status} sets claim-${status}`, () => {
      const html = page(["C1"], [makeClaim({ id: "C1", status, owner: "Sam" })]);
      expect(html).toContain(`class="claim-marker claim-${status}"`);
      expect(html).toContain(`claim-status-${status}`);
    });
  }

  const verdicts: Verdict[] = ["supports", "overstates", "contradicts", "unrelated", "uncheckable"];
  for (const verdict of verdicts) {
    test(`verdict ${verdict} sets verdict-${verdict}`, () => {
      const html = page(["C1"], [makeClaim({ id: "C1", verdict })]);
      expect(html).toContain(`class="claim-marker claim-verified verdict-${verdict}"`);
      expect(html).toContain(`verdict-badge verdict-${verdict}`);
    });
  }

  test("not_verified row shows its owner", () => {
    const html = page(["C1"], [makeClaim({ id: "C1", status: "not_verified", owner: "Sam" })]);
    expect(html).toContain("Owner: Sam");
  });

  test("panel script appears once and has no http URL", () => {
    const html = page(["C1"], [full]);
    expect(html.split(CLAIM_PANEL_SCRIPT).length - 1).toBe(1);
    expect(CLAIM_PANEL_SCRIPT).not.toMatch(/https?:/);
  });

  test("escapes claim text in the aria-label and row", () => {
    const html = page(["C1"], [makeClaim({ id: "C1", claim: 'a "b" <i>' })]);
    expect(html).not.toContain("<i>");
    expect(html).toContain("&quot;b&quot;");
  });
});

describe("claim theme", () => {
  test("markers do not use the help cursor", () => {
    expect(THEME_CSS).not.toMatch(/\.claim-marker\s*\{[^}]*cursor:\s*help/);
  });

  test("the panel is hidden in print and the Claims list is not", () => {
    const print = THEME_CSS.slice(THEME_CSS.indexOf("@media print"));
    expect(print.slice(0, print.indexOf("}"))).toContain(".claim-panel");
    expect(print).not.toContain(".claims-list");
  });

  test("claim colour rules use only --badge-*-text tokens", () => {
    const rules = THEME_CSS.match(/^\.(claim-marker|claim-status|verdict-badge)[^{]*\{[^}]*color:[^}]*\}/gm) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      const colours = r.match(/(?<![-\w])color:\s*[^;]+/g) ?? [];
      for (const c of colours) expect(c).toMatch(/var\(--badge-(high|med|low)-text\)/);
    }
  });
});
