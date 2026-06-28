#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: lint-artifact.mjs <path>");
  process.exit(2);
}
if (!existsSync(filePath)) {
  console.error(`Not found: ${filePath}`);
  process.exit(2);
}

function readPort() {
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), ".config", "html-artifact.json"), "utf8"),
    );
    return cfg.port || 52010;
  } catch {
    return 52010;
  }
}
const PORT = readPort();
const STYLE_URL = `http://localhost:${PORT}/style/main.css`;

const raw = readFileSync(filePath, "utf8");

// Replace <pre>/<code> content with spaces to skip false positives; preserve newlines for accurate line numbers.
const sanitized = raw
  .replace(/<pre[\s\S]*?<\/pre>/gi, (m) => m.replace(/[^\n]/g, " "))
  .replace(/<code[\s\S]*?<\/code>/gi, (m) => m.replace(/[^\n]/g, " "));

const lines = sanitized.split("\n");
const violations = [];

const hit = (lineNum, check, msg) => violations.push({ lineNum, check, msg });

const styleBlock = sanitized.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
if (
  styleBlock &&
  (styleBlock[1].includes("--mate-primary:") || styleBlock[1].length > 1024)
) {
  const lineNum = raw.slice(0, raw.indexOf(styleBlock[0])).split("\n").length;
  hit(lineNum, "inlined-css", `CSS is inlined — link to ${STYLE_URL} instead`);
}

lines.forEach((line, i) => {
  if (line.includes('rel="stylesheet"')) {
    if (line.includes('href="file://')) {
      hit(i + 1, "bad-css-link", `CSS link uses file:// — use ${STYLE_URL}`);
    } else if (
      line.includes('href="../style/') ||
      line.includes('href="./style/')
    ) {
      hit(
        i + 1,
        "bad-css-link",
        `CSS link uses relative path — use ${STYLE_URL}`,
      );
    }
  }
});

// 3. No stylesheet
if (!sanitized.includes('<link rel="stylesheet"')) {
  hit(
    1,
    "no-stylesheet",
    `No stylesheet — add <link rel="stylesheet" href="${STYLE_URL}">`,
  );
}

// 4. --mate-frame-muted on <p> body copy
lines.forEach((line, i) => {
  if (line.includes("<p") && line.includes("--mate-frame-muted")) {
    hit(
      i + 1,
      "muted-body-copy",
      "<p> uses --mate-frame-muted — body copy must use --mate-frame-text",
    );
  }
});

// 5. Small font sizes outside exempt label contexts
const SMALL_FONT_EXEMPT =
  /spec-rail-label|<th|badge|breadcrumb|footer|font-mono|stat-title|sev-/;
lines.forEach((line, i) => {
  if (/font-size:\s*1[23]px/.test(line) && !SMALL_FONT_EXEMPT.test(line)) {
    hit(i + 1, "small-font", "font-size 12/13px on body element — use 14px+");
  }
});

// 6. Light-mode hardcoded hex
const LIGHT_HEX = [
  "#fef2f2",
  "#f0fdf4",
  "#374151",
  "#6b7280",
  "#9ca3af",
  "#e5e7eb",
  "#f3f4f6",
];
lines.forEach((line, i) => {
  for (const hex of LIGHT_HEX) {
    if (line.toLowerCase().includes(hex)) {
      hit(
        i + 1,
        "light-hex",
        `Light-mode hex ${hex} — use mate token or rgba with opacity`,
      );
      break;
    }
  }
});

// Report
if (violations.length === 0) {
  console.log(`✅  ${filePath}`);
  process.exit(0);
}

console.error(`\n❌  ${filePath} — ${violations.length} violation(s)\n`);
for (const { lineNum, check, msg } of violations) {
  console.error(`  ${filePath}:${lineNum}  [${check}]`);
  console.error(`    ${msg}`);
}
console.error("");
process.exit(1);
