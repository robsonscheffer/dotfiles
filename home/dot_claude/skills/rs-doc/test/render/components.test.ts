import { describe, expect, test } from "bun:test";
import { renderDirective } from "../../src/render/directives.ts";
import { renderBlock } from "../../src/render/block.ts";
import { createCtx } from "../../src/render/ctx.ts";
import type { DirectiveNode } from "../../src/types.ts";
import { codeBlock, directive, heading, link, listItem, makeClaim, makeLedger, para, span, table, text } from "./helpers.ts";

const ctx = () => createCtx(null, { theme: "auto" });

describe("means / warn / note callouts", () => {
  test("means renders a What it means box", () => {
    const n = directive("means", { children: [para(text("It means the flag is on."))] });
    expect(renderDirective(n, ctx())).toMatchSnapshot();
  });
  test("warn renders a warning callout", () => {
    const n = directive("warn", { children: [para(text("This will break on retry."))] });
    expect(renderDirective(n, ctx())).toMatchSnapshot();
  });
  test("note renders a note callout", () => {
    const n = directive("note", { children: [para(text("Only applies to new accounts."))] });
    expect(renderDirective(n, ctx())).toMatchSnapshot();
  });
});

describe("collide", () => {
  test("registers the term and chips later occurrences", () => {
    const c = ctx();
    const collideNode = directive("collide", { args: ["order"], children: [para(text("An order here means a checkout order, not a work order."))] });
    const collideHtml = renderDirective(collideNode, c);
    expect(collideHtml).toContain("Term collision: order");

    const laterPara = para(text("Every order gets a receipt."));
    const laterHtml = renderBlock(laterPara, c);
    expect(laterHtml).toContain('class="term-chip"');
  });
});

describe("tiles", () => {
  test("parses label: value {Cn} lines into stat tiles", () => {
    const n = directive("tiles", { raw: ["Qualifying: 918 {C12}", "Excluded: 42"] });
    const claim = makeClaim({ id: "C12", claim: "918 qualify.", status: "verified", evidence: { kind: "query", sql: "q.sql", expect: { value: 918 }, needs: "snow" } });
    const html = renderDirective(n, createCtx(makeLedger([claim]), { theme: "auto" }));
    expect(html).toContain("918");
    expect(html).toContain("Qualifying");
    expect(html).toContain("claim-marker");
    expect(html).toMatchSnapshot();
  });
});

describe("flow", () => {
  test("builds an SVG from A -> B : label lines", () => {
    const n = directive("flow", { raw: ["cart -> checkout : submit", "checkout -> paid : confirm"] });
    const html = renderDirective(n, ctx());
    expect(html).toContain("<svg");
    expect(html).toContain("cart");
    expect(html).toContain("checkout");
    expect(html).toMatchSnapshot();
  });

  test("never contains a hex color", () => {
    const n = directive("flow", { raw: ["a -> b : go", "b -> c : go"] });
    const html = renderDirective(n, ctx());
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).toContain("currentColor");
    expect(html).toContain("var(--flow-fill)");
  });
});

describe("steps / tabs / cards", () => {
  test("steps render as a numbered list", () => {
    const n = directive("steps", { children: [para(text("First do this.")), para(text("Then do that."))] });
    const html = renderDirective(n, ctx());
    expect(html).toContain("step-number");
    expect(html).toMatchSnapshot();
  });

  test("tabs render buttons, panels, and a tiny inline script", () => {
    const n = directive("tabs", {
      children: [heading(2, "tab-a", "First"), heading(2, "tab-b", "Second")],
    });
    const html = renderDirective(n, ctx());
    expect(html).toContain('role="tablist"');
    expect(html).toContain("<script>");
    expect(html).toContain("First");
    expect(html).toContain("Second");
  });

  test("cards render link cards only", () => {
    const n = directive("cards", {
      children: [para(link("url", "https://example.com/a", text("Card A"))), para(link("md", "./b.md", text("Card B")))],
    });
    const html = renderDirective(n, ctx());
    expect(html).toContain('class="card"');
    expect(html).toContain("Card A");
  });
});

describe("decide", () => {
  test("renders an open question with an owner", () => {
    const n = directive("decide", { args: ["Sam"], children: [para(text("Which ID does the lab record split by?"))] });
    const html = renderDirective(n, ctx());
    expect(html).toContain("Decide with: Sam");
    expect(html).toMatchSnapshot();
  });
});

describe("risks", () => {
  test("badges HIGH/MED/LOW severity cells", () => {
    const t = table([[text("Risk")], [text("Severity")]], [
      [[text("Data loss")], [text("HIGH")]],
      [[text("Slow rollout")], [text("MED")]],
      [[text("Cosmetic bug")], [text("LOW")]],
    ]);
    const n: DirectiveNode = directive("risks", { children: [t] });
    const html = renderDirective(n, ctx());
    expect(html).toContain("risk-badge risk-high");
    expect(html).toContain("risk-badge risk-med");
    expect(html).toContain("risk-badge risk-low");
  });
});

describe("notverified", () => {
  test("lists every not_verified claim with its owner", () => {
    const claims = [
      makeClaim({ id: "C1", claim: "Verified thing.", status: "verified", evidence: { kind: "code", ref: "a@b:c:1", excerpt: "x", needs: "git" } }),
      makeClaim({ id: "C19", claim: "Which ID the lab record splits by.", status: "not_verified", owner: "Sam" }),
    ];
    const n = directive("notverified");
    const html = renderDirective(n, createCtx(makeLedger(claims), { theme: "auto" }));
    expect(html).toContain("C19");
    expect(html).toContain("Owner: Sam");
    expect(html).not.toContain("C1<");
  });

  test("renders an empty state with no open claims", () => {
    const n = directive("notverified");
    const html = renderDirective(n, createCtx(makeLedger([]), { theme: "auto" }));
    expect(html).toContain("not-verified-empty");
  });
});

describe("diff code fence", () => {
  test("styles added and removed lines with a file title", () => {
    const block = codeBlock("+added line\n-removed line\n context line", "diff", { title: "src/orders.ts" });
    const html = renderBlock(block, ctx());
    expect(html).toContain("src/orders.ts");
    expect(html).toContain("diff-add");
    expect(html).toContain("diff-del");
    expect(html).toMatchSnapshot();
  });
});

describe("code block highlighting", () => {
  test("highlights at build time with no client script", () => {
    const block = codeBlock("const x = 1;", "javascript");
    const html = renderBlock(block, ctx());
    expect(html).toContain("hljs");
    expect(html).not.toContain("<script");
  });
});

describe("unresolved and missing links", () => {
  test("an unresolved md link renders without a stray href", () => {
    const n = para(link("md", "./missing.md", text("missing doc")));
    const html = renderBlock(n, createCtx(null, { theme: "auto", resolveLink: () => null }));
    expect(html).toContain("link-unresolved");
    expect(html).not.toContain("href=\"./missing.md\"");
  });
});

describe("lists and blockquote", () => {
  test("checkbox list items and callout blockquotes render", () => {
    const l = { type: "list" as const, ordered: false, pos: span(), children: [listItem(para(text("done")))] };
    l.children[0]!.checked = true;
    const html = renderBlock(l, ctx());
    expect(html).toContain('type="checkbox" disabled checked');
  });
});
