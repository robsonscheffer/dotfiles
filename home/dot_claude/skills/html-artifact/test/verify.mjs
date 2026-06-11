#!/usr/bin/env node
import { readFileSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const SRC = join(ROOT, "src");

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function fileSize(path) {
  return existsSync(path) ? statSync(path).size : 0;
}

function fileContent(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

console.log("\ndist/ output files");
const distFiles = {
  showcase: join(DIST, "showcase.html"),
  spec: join(DIST, "templates", "spec.html"),
  report: join(DIST, "templates", "report.html"),
  prototype: join(DIST, "templates", "prototype.html"),
  dashboard: join(DIST, "templates", "dashboard.html"),
};
for (const [name, path] of Object.entries(distFiles)) {
  assert(`${name}.html exists`, existsSync(path));
}

console.log("\nfile sizes (CSS must be inlined)");
assert(
  "showcase.html > 50 KB",
  fileSize(distFiles.showcase) > 50_000,
  `got ${fileSize(distFiles.showcase)} bytes`,
);
for (const name of ["spec", "report", "prototype", "dashboard"]) {
  assert(
    `templates/${name}.html > 20 KB`,
    fileSize(distFiles[name]) > 20_000,
    `got ${fileSize(distFiles[name])} bytes`,
  );
}

console.log("\nno external CSS references in dist/");
for (const [name, path] of Object.entries(distFiles)) {
  const content = fileContent(path);
  assert(
    `${name}.html has no ../style/main.css ref`,
    !content.includes("../style/main.css") &&
      !content.includes("./style/main.css"),
  );
}

console.log("\ndist/style/ CSS output");
const cssPath = join(DIST, "style", "main.css");
assert("dist/style/main.css exists", existsSync(cssPath));
assert(
  "dist/style/main.css > 15 KB",
  fileSize(cssPath) > 15_000,
  `got ${fileSize(cssPath)} bytes`,
);
const cssContent = fileContent(cssPath);
assert(
  "dist/style/main.css contains mate tokens",
  cssContent.includes("--mate-primary"),
);

console.log("\ncontent slots present in templates");
const SLOTS = ["<!-- TITLE -->", "<!-- DATE -->"];
for (const name of ["spec", "report", "prototype", "dashboard"]) {
  const content = fileContent(distFiles[name]);
  for (const slot of SLOTS) {
    assert(`templates/${name}.html has ${slot}`, content.includes(slot));
  }
}

console.log("\nCSS source — main.css imports");
const mainCss = fileContent(join(SRC, "style", "main.css"));
const expectedImports = [
  '@import "tailwindcss"',
  "daisyui/base/properties.css",
  "./daisyui-components.css",
  "./tokens.css",
  "./components/page-layout.css",
  "./components/severity-chip.css",
  "./components/lifecycle-badge.css",
  "./components/stat-delta.css",
  "./components/code-diff.css",
  "./components/spec-rail.css",
  "./components/spec-decision.css",
  "./components/palette-swatch.css",
];
for (const imp of expectedImports) {
  assert(`main.css imports ${imp}`, mainCss.includes(imp));
}

console.log("\ntokens.css — mate custom properties");
const tokensCss = fileContent(join(SRC, "style", "tokens.css"));
const expectedTokens = [
  "--mate-primary",
  "--mate-secondary",
  "--mate-success",
  "--mate-error",
  "--mate-warning",
  "--mate-info",
  "--mate-frame-bg",
  "--mate-font-display",
  "--mate-font-body",
  "--mate-font-mono",
  '[data-theme="mate"]',
];
for (const token of expectedTokens) {
  assert(`tokens.css defines ${token}`, tokensCss.includes(token));
}

console.log("\nshowcase — 11 DS sections present");
const showcase = fileContent(distFiles.showcase);
const sectionIds = [
  "nav",
  "buttons",
  "forms",
  "alerts",
  "progress",
  "stats",
  "badges",
  "palette",
  "diff",
  "spec",
  "tooltips",
];
for (const id of sectionIds) {
  assert(`showcase has section id="${id}"`, showcase.includes(`id="${id}"`));
}

console.log(
  `\n${passed + failed} checks — ${passed} passed, ${failed} failed\n`,
);
if (failed > 0) process.exit(1);
