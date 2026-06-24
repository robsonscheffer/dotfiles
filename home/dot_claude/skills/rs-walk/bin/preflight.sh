#!/usr/bin/env bash
# rs-walk preflight — checks all dependencies, sets up wiki/walks/ and qmd collections.
# Outputs: CONTEXT_MODE=qmd|grep on stdout. All info/warn messages go to stderr.
# Exits non-zero with a message on any hard failure.
set -euo pipefail

REPORT_TEMPLATE="${HOME}/.claude/skills/html-artifact/dist/templates/report.html"
LINT_BIN="${HOME}/.claude/skills/html-artifact/bin/lint-artifact.mjs"
WALKS_DIR="${HOME}/brain/wiki/walks"
WALKS_INDEX="${WALKS_DIR}/index.html"

# ── 1. gh CLI ────────────────────────────────────────────────────────────────
if ! command -v gh &>/dev/null; then
  echo "ERROR: gh CLI not found. Install with: brew install gh" >&2
  exit 1
fi
if ! gh auth status &>/dev/null; then
  echo "ERROR: gh CLI not authenticated. Run: gh auth login" >&2
  exit 1
fi

# ── 2. html-artifact DS ──────────────────────────────────────────────────────
if [ ! -f "${REPORT_TEMPLATE}" ]; then
  echo "ERROR: html-artifact report template missing at ${REPORT_TEMPLATE}" >&2
  exit 1
fi
if [ ! -f "${LINT_BIN}" ]; then
  echo "ERROR: html-artifact lint binary missing at ${LINT_BIN}" >&2
  exit 1
fi

# ── 3. wiki/walks/ first-run ─────────────────────────────────────────────────
if [ ! -d "${WALKS_DIR}" ]; then
  mkdir -p "${WALKS_DIR}"
  echo "INFO: Created ${WALKS_DIR} — index.html will be seeded by the skill." >&2
fi

# ── 4. qmd — optional, self-healing ─────────────────────────────────────────
CONTEXT_MODE=grep

if command -v qmd &>/dev/null; then
  # Brain collection
  if ! qmd collection list --json 2>/dev/null | jq -e '.[] | select(.name=="brain")' >/dev/null 2>&1; then
    echo "INFO: Adding brain collection to qmd (first run — may take ~60s)..." >&2
    qmd collection add "${HOME}/brain/wiki" brain >&2
    qmd update brain >&2
  fi

  # Walks collection — only if directory has content
  if ! qmd collection list --json 2>/dev/null | jq -e '.[] | select(.name=="walks")' >/dev/null 2>&1; then
    echo "INFO: Adding walks collection to qmd..." >&2
    qmd collection add "${WALKS_DIR}" walks >&2
    qmd update walks 2>/dev/null >&2 || true
  fi

  CONTEXT_MODE=qmd
fi

echo "CONTEXT_MODE=${CONTEXT_MODE}"
