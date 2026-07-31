#!/usr/bin/env node
// rs-walk lint-walk — validates that a generated walk is a genuinely standalone
// document. Replaces html-artifact's lint-artifact.mjs, whose first rule
// ("CSS is inlined — link to localhost instead") is the exact inverse of what a
// walk needs, so every walk failed it and the failure had to be ignored.
//
// This one is a hard gate. Usage: lint-walk.mjs <walk.html>
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: lint-walk.mjs <walk.html>");
  process.exit(2);
}
if (!existsSync(filePath)) {
  console.error(`Not found: ${filePath}`);
  process.exit(2);
}

const raw = readFileSync(filePath, "utf8");
const violations = [];
const hit = (check, msg) => violations.push({ check, msg });

// Split the document once: the inlined stylesheet is one enormous line and
// would otherwise false-positive every content rule that greps for markup.
const styleMatch = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
const inlinedCss = styleMatch ? styleMatch[1] : "";
const markup = styleMatch ? raw.replace(styleMatch[0], "") : raw;

// ── 1. CSS must be inlined, and nothing may be linked ────────────────────────
if (!styleMatch) {
  hit("no-inlined-css", "No inlined <style> — a walk must carry its own CSS");
}
for (const m of markup.matchAll(/<link\b[^>]*>/gi)) {
  if (/rel=["']?stylesheet/i.test(m[0])) {
    hit(
      "linked-stylesheet",
      `Linked stylesheet — inline it instead: ${m[0].trim()}`,
    );
  }
}

// ── 2. Nothing may reach the network or this machine ─────────────────────────
for (const [pattern, check, label] of [
  [
    /https?:\/\/(localhost|127\.0\.0\.1)[:\/]/gi,
    "localhost-ref",
    "localhost reference",
  ],
  [/\bfile:\/\/\//g, "file-ref", "absolute file:// reference"],
  [/<link\b[^>]*href=["']https?:/gi, "external-link", "external <link>"],
  [
    /<script\b[^>]*\bsrc=["']https?:/gi,
    "external-script",
    "external <script src>",
  ],
  [
    /@import\s+url\(["']?https?:/gi,
    "external-import",
    "@import of a remote stylesheet",
  ],
]) {
  const found = [...raw.matchAll(pattern)];
  if (found.length) {
    hit(
      check,
      `${found.length}× ${label} — a walk must open offline (first: ${found[0][0].slice(0, 60)})`,
    );
  }
}

// ── 3. Root-absolute URLs break over file:// ─────────────────────────────────
for (const m of markup.matchAll(/\b(?:href|src)=["']\/(?!\/)[^"']*["']/gi)) {
  hit(
    "root-absolute-url",
    `Root-absolute URL resolves to file:///... — use a relative path: ${m[0]}`,
  );
}

// ── 4. Both themes must exist, and nothing else may be referenced ────────────
const defined = new Set(
  [...inlinedCss.matchAll(/\[data-theme=["']?([\w-]+)["']?\]/g)].map(
    (m) => m[1],
  ),
);
for (const required of ["mate", "mate-light"]) {
  if (!defined.has(required)) {
    hit(
      "missing-theme",
      `Stylesheet does not define [data-theme="${required}"]`,
    );
  }
}
const referenced = new Set([
  ...[...markup.matchAll(/data-theme=["']([\w-]+)["']/g)].map((m) => m[1]),
  ...[...markup.matchAll(/THEMES\s*=\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/["']([\w-]+)["']/g)].map((x) => x[1]),
  ),
]);
for (const t of referenced) {
  if (!defined.has(t)) {
    hit(
      "dead-theme",
      `References theme "${t}" that the stylesheet does not define`,
    );
  }
}

// ── 5. A theme switcher must exist ───────────────────────────────────────────
if (!markup.includes("toggleTheme") && !markup.includes("setTheme")) {
  hit("no-theme-switcher", "No theme switcher found");
}

// ── 6. Fonts must match tokens.css, and be inlined ───────────────────────────
const tokensPath = join(SKILL_ROOT, "assets", "style", "tokens.css");
if (existsSync(tokensPath)) {
  const tokens = readFileSync(tokensPath, "utf8");
  const families = new Set(
    [...tokens.matchAll(/--mate-font-[\w-]+:\s*"([^"]+)"/g)].map((m) => m[1]),
  );
  for (const family of families) {
    if (
      !inlinedCss.includes(`font-family: '${family}'`) &&
      !inlinedCss.includes(`font-family: "${family}"`) &&
      !inlinedCss.includes(`font-family:'${family}'`) &&
      !inlinedCss.includes(`font-family:"${family}"`)
    ) {
      hit(
        "font-not-inlined",
        `tokens.css asks for "${family}" but no @font-face inlines it — ` +
          "run bin/fetch-fonts.py",
      );
    }
  }
}

// ── 7. Build stamp ───────────────────────────────────────────────────────────
if (!/<meta\s+name=["']generator["']\s+content=["']rs-walk@/i.test(markup)) {
  hit(
    "no-build-stamp",
    'Missing <meta name="generator" content="rs-walk@..."> — staleness must be greppable',
  );
}

if (violations.length === 0) {
  console.log(`OK  ${filePath}`);
  process.exit(0);
}

console.error(`\n${filePath} — ${violations.length} violation(s)\n`);
for (const { check, msg } of violations) {
  console.error(`  [${check}] ${msg}`);
}
console.error("");
process.exit(1);
