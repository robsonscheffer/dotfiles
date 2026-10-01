import { describe, expect, test } from "bun:test";
import { render } from "../../src/render/index.ts";
import { directive, heading, link, makeClaim, makeDoc, makeLedger, para, text } from "./helpers.ts";

describe("page shell", () => {
  test("no http URLs in the output unless a content link is present", () => {
    const doc = makeDoc([para(text("Plain sentence with no links or citations."))], {
      title: "Orders",
      summary: "How checkout orders flow.",
    });
    const html = render(doc, null, { theme: "auto" });
    expect(html).not.toContain("http");
  });

  test("a content link's URL does appear", () => {
    const doc = makeDoc([para(text("See "), link("url", "https://example.com/orders", text("the orders doc")))], {
      title: "Orders",
    });
    const html = render(doc, null, { theme: "auto" });
    expect(html).toContain("https://example.com/orders");
  });

  test("template chrome never emits an em-dash", () => {
    // Content is deliberately em-dash-free; this checks the renderer's own static strings
    // (banner, callouts, nav labels, etc.), not whatever a source document might contain.
    const doc = makeDoc([heading(2, "checkout", "Checkout overview"), para(text("This step runs first."))], {
      title: "Checkout flow",
    });
    const html = render(doc, null, {
      theme: "auto",
      banner: { level: "audited", claims: 5, open: 1, fresh: false },
      nav: {
        breadcrumbs: [{ title: "Guide", href: "/guide" }],
        pages: [{ title: "Checkout flow", href: "/guide/checkout", current: true }],
      },
    });
    expect(html).not.toContain("—");
  });

  test("dark mode tokens are present", () => {
    const doc = makeDoc([para(text("Hello."))], { title: "Hello" });
    const html = render(doc, null, { theme: "auto" });
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain('html[data-theme="dark"]');
  });

  test("forced light/dark theme sets the data attribute", () => {
    const doc = makeDoc([para(text("Hello."))], { title: "Hello" });
    const dark = render(doc, null, { theme: "dark" });
    expect(dark).toContain('<html lang="en" data-theme="dark">');
    const light = render(doc, null, { theme: "light" });
    expect(light).toContain('<html lang="en" data-theme="light">');
  });

  test("status banner renders the expected format", () => {
    const doc = makeDoc([para(text("Body."))], { title: "Orders", summary: "Summary." });
    const html = render(doc, null, {
      theme: "auto",
      banner: { level: "official", approvedAt: "2026-09-25", claims: 34, open: 2, fresh: true },
    });
    expect(html).toContain("Official &middot; approved 2026-09-25 &middot; 34 claims checked &middot; 2 open &middot; fresh");
  });

  test("right-hand TOC lists h2/h3 headings with anchors", () => {
    const doc = makeDoc(
      [heading(2, "intro", "Intro"), heading(3, "sub", "Sub point"), heading(2, "next", "Next section")],
      { title: "Guide" },
      [
        { level: 2, id: "intro", text: "Intro", pos: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } },
        { level: 3, id: "sub", text: "Sub point", pos: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } },
        { level: 2, id: "next", text: "Next section", pos: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } },
      ],
    );
    const html = render(doc, null, { theme: "auto" });
    expect(html).toContain('<nav class="toc"');
    expect(html).toContain('href="#intro"');
    expect(html).toContain('href="#sub"');
    expect(html).toContain('href="#next"');
    expect(html).toContain('<h2 id="intro">Intro<a class="anchor" href="#intro"');
    expect(html).toContain("<details open><summary>Contents</summary>");
    expect(html).toContain("(max-width: 900px)");
  });

  test("folder mode renders left nav, breadcrumbs, and prev/next", () => {
    const doc = makeDoc([para(text("Body."))], { title: "Step two" });
    const html = render(doc, null, {
      theme: "auto",
      nav: {
        breadcrumbs: [{ title: "Guide", href: "/guide" }, { title: "Step two", href: "/guide/step-two" }],
        pages: [
          { title: "Step one", href: "/guide/step-one", current: false },
          { title: "Step two", href: "/guide/step-two", current: true },
        ],
        prev: { title: "Step one", href: "/guide/step-one", current: false },
        next: undefined,
      },
    });
    expect(html).toContain('<nav class="left-nav"');
    expect(html).toContain('<nav class="breadcrumbs"');
    expect(html).toContain('class="prev-link"');
    expect(html).toContain("Step one");
  });

  test("claimRef to a missing claim shows a visible red marker", () => {
    const doc = makeDoc(
      [para(text("Some sentence."), { type: "claimRef", id: "C99", pos: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } })],
      { title: "Doc" },
    );
    const html = render(doc, makeLedger([]), { theme: "auto" });
    expect(html).toContain("claim-missing");
    expect(html).toContain("Missing claim C99");
  });

  test("claimRef renders its evidence line below the sentence", () => {
    const claim = makeClaim({
      id: "C7",
      claim: "Checkout clicks take their label from the nearest attribute.",
      status: "verified",
      verdict: "supports",
      checked_at: "2026-09-25",
      evidence: { kind: "code", ref: "acme/web@main:src/label.ts:42", excerpt: "const label = 1", needs: "git" },
    });
    const doc = makeDoc([para(text("Labels come from the attribute."), { type: "claimRef", id: "C7", pos: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } })], {
      title: "Doc",
    });
    const html = render(doc, makeLedger([claim]), { theme: "auto" });
    expect(html).toContain("claim-evidence");
    expect(html).toContain("acme/web@main:src/label.ts:42");
    expect(html).toContain("2026-09-25");
    expect(html).toContain("verdict-supports");
  });
});

describe("rail placement", () => {
  test("a :::rail directive renders in the side column above the TOC, not inline in main", () => {
    const rail = directive("rail", { raw: ["Author: Sam"] });
    const doc = makeDoc(
      [rail, heading(2, "intro", "Intro"), para(text("Body."))],
      { title: "Doc" },
      [{ level: 2, id: "intro", text: "Intro", pos: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } }],
    );
    const html = render(doc, null, { theme: "auto" });
    const sideMatch = /<aside class="side-col">(.*)<\/aside>\s*<\/div>/s.exec(html);
    expect(sideMatch).not.toBeNull();
    const side = sideMatch![1]!;
    expect(side).toContain('class="rail"');
    expect(side.indexOf('class="rail"')).toBeLessThan(side.indexOf('class="toc"'));

    const mainMatch = /<main>(.*)<\/main>/s.exec(html);
    expect(mainMatch).not.toBeNull();
    expect(mainMatch![1]).not.toContain('class="rail"');
  });

  test("no rail: no side-col wrapper appears without a TOC either", () => {
    const doc = makeDoc([para(text("Just a paragraph."))], { title: "Doc" });
    const html = render(doc, null, { theme: "auto" });
    expect(html).not.toContain('class="side-col"');
  });
});

describe("notes box", () => {
  test("notes: true renders one control per h2, and the toolbar", () => {
    const doc = makeDoc(
      [heading(2, "first", "First"), para(text("Body one.")), heading(2, "second", "Second"), para(text("Body two."))],
      { title: "Doc", extra: { notes: true } },
    );
    const html = render(doc, null, { theme: "auto" });
    expect(html).toContain("notes-toolbar");
    expect(html).toContain("notes-copy-btn");
    expect(html).toContain("notes-download-btn");
    const matches = html.match(/class="note-control"/g) ?? [];
    expect(matches.length).toBe(2);
    expect(html).toContain('data-note-slug="first"');
    expect(html).toContain('data-note-slug="second"');
  });

  test("without notes: true, no notes controls or toolbar render", () => {
    const doc = makeDoc([heading(2, "first", "First"), para(text("Body one."))], { title: "Doc" });
    const html = render(doc, null, { theme: "auto" });
    expect(html).not.toContain('class="note-control"');
    expect(html).not.toContain('class="notes-toolbar"');
  });

  test("the page is readable with scripts off: notes controls carry the hidden attribute by default", () => {
    const doc = makeDoc([heading(2, "first", "First"), para(text("Body one."))], { title: "Doc", extra: { notes: true } });
    const html = render(doc, null, { theme: "auto" });
    expect(html).toContain('class="note-control" data-note-slug="first" hidden');
    expect(html).toContain('class="notes-toolbar" hidden');
  });
});
