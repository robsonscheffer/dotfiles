#!/usr/bin/env bash
# rs-walk preflight — checks all dependencies, sets up wiki/walks/ and qmd collections.
# Outputs CONTEXT_MODE=qmd|grep and ARTIFACT_MODE=json|standalone on stdout.
# All info/warn messages go to stderr. Exits non-zero on any hard failure.
set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WALK_CSS="${SKILL_ROOT}/assets/walk.css"
LINT_BIN="${SKILL_ROOT}/bin/lint-walk.mjs"
WALK_TEMPLATE="${SKILL_ROOT}/assets/walk-template.html"
WALKS_DIR="${HOME}/brain/wiki/walks"
ARTIFACTS_JSON="${HOME}/brain/wiki/artifact/artifacts.json"

HARD_FAIL=0
fail() {
  echo "ERROR: $1" >&2
  HARD_FAIL=1
}

# ── 1. gh CLI ────────────────────────────────────────────────────────────────
if ! command -v gh &>/dev/null; then
  fail "gh CLI not found. Install with: brew install gh"
elif ! gh auth status &>/dev/null; then
  fail "gh CLI not authenticated. Run: gh auth login"
fi

# ── 2. node — needed by the walk linter ──────────────────────────────────────
command -v node &>/dev/null || fail "node not found — required by ${LINT_BIN}"

# ── 3. rs-walk's own assets ──────────────────────────────────────────────────
# Everything a walk needs ships with this skill. No sibling-skill lookups.
[ -f "${WALK_TEMPLATE}" ] || fail "walk template missing at ${WALK_TEMPLATE}"
[ -f "${LINT_BIN}" ] || fail "walk linter missing at ${LINT_BIN}"
if [ ! -f "${WALK_CSS}" ]; then
  echo "INFO: ${WALK_CSS} missing — building it..." >&2
  bash "${SKILL_ROOT}/bin/build-assets.sh" "${WALK_CSS}" >&2 ||
    fail "could not build ${WALK_CSS}"
fi

[ "${HARD_FAIL}" -eq 0 ] || exit 1

# ── 4. wiki/walks/ first-run ─────────────────────────────────────────────────
if [ ! -d "${WALKS_DIR}" ]; then
  mkdir -p "${WALKS_DIR}"
  echo "INFO: Created ${WALKS_DIR} — index.html will be seeded by the skill." >&2
fi

# ── 5. qmd — optional, self-healing ─────────────────────────────────────────
CONTEXT_MODE="grep"

if command -v qmd &>/dev/null; then
  # `qmd collection list --json` does not actually emit JSON (plain text
  # regardless of the flag) — parse the real output instead of trusting the
  # flag name. A collection line looks like "brain (qmd://brain/)" at the
  # start of a line, indented sub-fields follow.
  QMD_COLLECTIONS="$(qmd collection list 2>/dev/null || true)"

  # Brain collection
  if ! grep -qE '^brain \(' <<<"${QMD_COLLECTIONS}"; then
    echo "INFO: Adding brain collection to qmd (first run — may take ~60s)..." >&2
    qmd collection add "${HOME}/brain/wiki" brain >&2
    qmd update brain >&2
  fi

  # Walks collection — only if directory has content
  if ! grep -qE '^walks \(' <<<"${QMD_COLLECTIONS}"; then
    echo "INFO: Adding walks collection to qmd..." >&2
    qmd collection add "${WALKS_DIR}" walks >&2
    qmd update walks 2>/dev/null >&2 || true
  fi

  CONTEXT_MODE=qmd
fi

# -- 6. artifacts.json - optional coupling with a wiki-wide unified index --
# Presence of the file is the whole contract. Absent is not an error: walks fall
# back to their own index at wiki/walks/index.html.
ARTIFACT_MODE=standalone
if [ -f "${ARTIFACTS_JSON}" ]; then
  ARTIFACT_MODE=json
fi

echo "CONTEXT_MODE=${CONTEXT_MODE}"
echo "ARTIFACT_MODE=${ARTIFACT_MODE}"
