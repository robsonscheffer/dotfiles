import { describe, expect, test } from "bun:test";
import { THEME_CSS } from "../../src/render/theme.ts";

// WCAG relative luminance / contrast ratio, straight from the spec's own formula.
function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a hex color: ${hex}`);
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => srgbToLinear(parseInt(h, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

// Balances braces from the selector's opening `{` to its matching `}`, so a block that itself
// contains nested rules (like `@media print { ... }`) comes back whole.
function cssBlock(css: string, selector: string): string {
  const idx = css.indexOf(selector);
  if (idx === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", idx);
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(open + 1, i - 1);
}

function varValue(block: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block);
  if (!m) throw new Error(`${name} not set in block`);
  return m[1]!;
}

describe("layout CSS", () => {
  test("the text column caps at 70ch, and wide content opts back out", () => {
    expect(THEME_CSS).toMatch(/max-width:\s*70ch/);
    expect(THEME_CSS).toMatch(/table[\s\S]{0,120}max-width:\s*none/);
  });

  test("the narrow layout stretches main, long refs and badges do not force width", () => {
    expect(cssBlock(THEME_CSS, "@media (max-width: 900px)")).toMatch(/\.layout \{[^}]*align-items: stretch/);
    expect(cssBlock(THEME_CSS, "@media (max-width: 900px)")).toContain("main table { display: block; overflow-x: auto; }");
    expect(cssBlock(THEME_CSS, ".risk-field {")).toContain("min-width: 0");
    expect(cssBlock(THEME_CSS, ".claim-source {")).toContain("min-width: 0");
    expect(cssBlock(THEME_CSS, ".badge {")).toContain("white-space: nowrap");
    expect(cssBlock(THEME_CSS, ".layout {")).not.toContain("max-width");
  });

  test("the hidden attribute always wins over component display rules", () => {
    expect(THEME_CSS).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  test("the control border token has a value in every theme block and passes 3:1", () => {
    expect(THEME_CSS.match(/--control-border:/g)?.length).toBe(4);
    expect(contrast(varValue(cssBlock(THEME_CSS, ":root"), "--control-border"), "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(contrast(varValue(cssBlock(THEME_CSS, 'html[data-theme="dark"]'), "--control-border"), "#14161a")).toBeGreaterThanOrEqual(3);
  });

  test("light code-string and code-comment pass AA on the code background", () => {
    const light = cssBlock(THEME_CSS, ":root");
    expect(contrast(varValue(light, "--code-string"), "#f4f5f7")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(varValue(light, "--code-comment"), "#f4f5f7")).toBeGreaterThanOrEqual(4.5);
  });

  test("exactly one narrow breakpoint governs the whole layout", () => {
    const matches = THEME_CSS.match(/@media \(max-width: \d+px\)/g) ?? [];
    expect(matches).toEqual(["@media (max-width: 900px)"]);
  });

  test("print hides nav, TOC, theme toggle, and notes controls, and expands collapsed details", () => {
    const printBlock = cssBlock(THEME_CSS, "@media print");
    for (const selector of [".breadcrumbs", ".left-nav", ".side-col", ".theme-toggle", ".notes-toolbar", ".note-control"]) {
      expect(printBlock).toContain(selector);
    }
    expect(printBlock).toContain("display: none !important");
    expect(printBlock).toMatch(/details:not\(\[open\]\)[^{]*\{\s*display: block !important/);
  });

  test("one focus-visible rule covers links, buttons, summaries, and form controls", () => {
    const rules = THEME_CSS.match(/^[^{]*:focus-visible[^{]*\{[^}]*\}/gm) ?? [];
    expect(rules.length).toBe(1);
    const selectors = rules[0]!;
    for (const tag of ["a:focus-visible", "button:focus-visible", "summary:focus-visible", "input:focus-visible", "textarea:focus-visible"]) {
      expect(selectors).toContain(tag);
    }
  });
});

describe("dark-mode badge contrast", () => {
  const lightRoot = cssBlock(THEME_CSS, ":root {");
  const darkBlock = cssBlock(THEME_CSS, 'html[data-theme="dark"]');
  const bgLight = varValue(lightRoot, "--bg");
  const bgDark = varValue(darkBlock, "--bg");

  for (const token of ["--badge-high-text", "--badge-med-text", "--badge-low-text"]) {
    test(`${token} reaches 4.5:1 against --bg in both themes`, () => {
      const light = contrast(varValue(lightRoot, token), bgLight);
      const dark = contrast(varValue(darkBlock, token), bgDark);
      expect(light).toBeGreaterThanOrEqual(4.5);
      expect(dark).toBeGreaterThanOrEqual(4.5);
    });
  }

  test("white risk-badge/inline-badge text reaches 4.5:1 against every badge background, in either theme (backgrounds don't change by theme)", () => {
    for (const token of ["--badge-high", "--badge-med", "--badge-low"]) {
      const bg = varValue(lightRoot, token);
      expect(contrast("#ffffff", bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // risk-card left borders, diff-file headers, status-stale, and every callout border key off
  // the same --badge-*-text tokens already checked above, so a risk card, a diff header, and
  // the viewer's stale-doc label all clear 4.5:1 in both themes without a new token.
  test("risk-card, diff-file, and checks components reuse the --badge-*-text tokens rather than a new color", () => {
    for (const selector of [".risk-card.risk-high", ".risk-card.risk-med", ".risk-card.risk-low"]) {
      const block = cssBlock(THEME_CSS, selector);
      expect(block).toMatch(/var\(--badge-(high|med|low)-text\)/);
    }
  });
});
