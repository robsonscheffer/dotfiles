import { describe, expect, test } from "bun:test";
import { renderDirective } from "../../src/render/directives.ts";
import { renderBlock } from "../../src/render/block.ts";
import { renderInline } from "../../src/render/inline.ts";
import { createCtx } from "../../src/render/ctx.ts";
import { computeFlowLayout } from "../../src/render/flow.ts";
import type { DirectiveNode } from "../../src/types.ts";
import { codeBlock, directive, heading, link, listItem, makeClaim, makeLedger, para, span, table, text } from "./helpers.ts";

const ctx = () => createCtx(null, { theme: "auto" });

function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

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

describe("tiles: stat delta", () => {
  test("renders a good delta when direction matches good-when", () => {
    const n = directive("tiles", { raw: ["Signups: 1,204 +12% up good-when:up"] });
    const html = renderDirective(n, ctx());
    expect(html).toContain("1,204");
    expect(html).toContain("tile-delta-good");
    expect(html).toContain("+12%");
    expect(html).toMatchSnapshot();
  });

  test("renders a good delta when a falling metric is the improvement", () => {
    const n = directive("tiles", { raw: ["Churn: 42 -3 down good-when:down"] });
    const html = renderDirective(n, ctx());
    expect(html).toContain("tile-delta-good");
  });

  test("renders a bad delta when direction contradicts good-when", () => {
    const n = directive("tiles", { raw: ["Churn: 42 +3 up good-when:down"] });
    const html = renderDirective(n, ctx());
    expect(html).toContain("tile-delta-bad");
  });

  test("good-when defaults to up when omitted", () => {
    const n = directive("tiles", { raw: ["Errors: 5 -1 down"] });
    const html = renderDirective(n, ctx());
    expect(html).toContain("tile-delta-bad");
  });

  test("a tile with no delta renders exactly as before", () => {
    const n = directive("tiles", { raw: ["Excluded: 42"] });
    const html = renderDirective(n, ctx());
    expect(html).not.toContain("tile-delta");
    expect(html).toContain("42");
  });
});

describe("inline badge", () => {
  test.each(["good", "warn", "bad", "info", "neutral"])("renders the %s tone", (tone) => {
    const html = renderInline([text(`:badge[Blocked]{tone=${tone}}`)], ctx());
    expect(html).toContain(`badge badge-${tone}`);
    expect(html).toContain("Blocked");
    expect(html).toMatchSnapshot();
  });

  test("defaults to neutral with no attrs", () => {
    const html = renderInline([text(":badge[Draft]")], ctx());
    expect(html).toContain("badge badge-neutral");
  });

  test("falls back to neutral for an unknown tone", () => {
    const html = renderInline([text(":badge[Weird]{tone=purple}")], ctx());
    expect(html).toContain("badge badge-neutral");
  });

  test("renders inside a table cell alongside plain text", () => {
    const cellHtml = renderInline([text("Rollout is "), text(":badge[Blocked]{tone=bad}"), text(" for now.")], ctx());
    expect(cellHtml).toContain("badge badge-bad");
    expect(cellHtml).toContain("Rollout is");
    expect(cellHtml).toContain("for now.");
  });

  test("escapes the label", () => {
    const html = renderInline([text(':badge[<script>]{tone=info}')], ctx());
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
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

  test("a branching node puts its branches on separate rows with no overlap", () => {
    // checkout has two outgoing edges (to paid and to abandoned); paid and abandoned must
    // land on different rows so neither the "abandoned" edge nor its label crosses "paid".
    const layout = computeFlowLayout(["cart -> checkout : submit", "checkout -> paid : confirm", "checkout -> abandoned : timeout"]);

    expect(layout.nodes.length).toBe(4);
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        expect(rectsOverlap(layout.nodes[i]!, layout.nodes[j]!)).toBe(false);
      }
    }

    for (const label of layout.labels) {
      for (const node of layout.nodes) {
        expect(rectsOverlap(label, node)).toBe(false);
      }
    }
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
      children: [
        heading(2, "tab-a", "First"),
        para(text("Body of the first tab.")),
        heading(2, "tab-b", "Second"),
        para(text("Body of the second tab.")),
      ],
    });
    const html = renderDirective(n, ctx());
    expect(html).toContain('role="tablist"');
    expect(html).toContain("<script>");
    expect(html).toContain("First");
    expect(html).toContain("Second");
  });

  test("tab buttons and panels carry full ARIA wiring", () => {
    const n = directive("tabs", {
      children: [heading(2, "tab-a", "First"), para(text("Body of the first tab.")), heading(2, "tab-b", "Second"), para(text("Body of the second tab."))],
    });
    const html = renderDirective(n, ctx());
    const buttonMatches = [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]!);
    expect(buttonMatches).toHaveLength(2);
    for (const btn of buttonMatches) {
      expect(btn).toContain('role="tab"');
      expect(btn).toMatch(/aria-selected="(true|false)"/);
      expect(btn).toMatch(/aria-controls="[^"]+"/);
      expect(btn).toMatch(/id="[^"]+"/);
    }
    const panelMatches = [...html.matchAll(/<div class="tab-panel"[^>]*>/g)].map((m) => m[0]!);
    expect(panelMatches).toHaveLength(2);
    for (const panel of panelMatches) {
      expect(panel).toContain('role="tabpanel"');
      expect(panel).toMatch(/aria-labelledby="[^"]+"/);
    }
    // Each button's aria-controls points at a panel id that actually exists, and vice versa.
    const controlsIds = buttonMatches.map((b) => /aria-controls="([^"]+)"/.exec(b)![1]!);
    const panelIds = panelMatches.map((p) => /id="([^"]+)"/.exec(p)![1]!);
    expect(controlsIds.sort()).toEqual(panelIds.sort());
  });

  test("a tab panel contains its non-heading children, and the heading isn't duplicated inside it", () => {
    const n = directive("tabs", {
      children: [heading(2, "tab-staging", "Staging"), para(text("Point the client at the staging origin.")), heading(2, "tab-prod", "Production")],
    });
    const html = renderDirective(n, ctx());
    const panelMatch = /<div class="tab-panel"[^>]*>(.*?)<\/div>/s.exec(html);
    expect(panelMatch).not.toBeNull();
    const firstPanel = panelMatch![1]!;
    expect(firstPanel).toContain("Point the client at the staging origin.");
    expect(firstPanel).not.toContain("<h2");
    expect(firstPanel).not.toContain("Staging");
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

describe("rail", () => {
  test("renders a plain key: value line", () => {
    const n = directive("rail", { raw: ["Branch: refactor/portal-storeless"] });
    const html = renderDirective(n, ctx());
    expect(html).toContain('class="rail"');
    expect(html).toContain("Branch");
    expect(html).toContain("refactor/portal-storeless");
    expect(html).toMatchSnapshot();
  });

  test("renders a badge value", () => {
    const n = directive("rail", { raw: ["Status: :badge[On track]{tone=good}"] });
    const html = renderDirective(n, ctx());
    expect(html).toContain("badge badge-good");
    expect(html).toContain("On track");
  });

  test("renders a markdown link value", () => {
    const n = directive("rail", { raw: ["PR: [#42](https://example.com/acme/console/pull/42)"] });
    const html = renderDirective(n, ctx());
    expect(html).toContain('<a href="https://example.com/acme/console/pull/42"');
    expect(html).toContain("#42");
  });

  test("skips a line with no colon", () => {
    const n = directive("rail", { raw: ["Branch: main", "not a key value line"] });
    const html = renderDirective(n, ctx());
    expect(html).toContain("Branch");
    expect(html).not.toContain("not a key value line");
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
