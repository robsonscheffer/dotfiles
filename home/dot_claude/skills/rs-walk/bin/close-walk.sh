#!/usr/bin/env bash
# rs-walk close-walk — seals a completed walk: updates meta.json, patches the
# verdict badge in the index, appends wiki/log.md, re-indexes qmd, commits.
#
# Usage: close-walk.sh <walk-dir> <pr-number> <verdict> [notes]
#   verdict: approved | changes-requested | commented
set -euo pipefail

WALK_DIR="${1:?usage: close-walk.sh <walk-dir> <pr-number> <verdict> [notes]}"
PR_NUMBER="${2:?missing pr-number}"
VERDICT="${3:?missing verdict}"
NOTES="${4:-}"
TODAY=$(date +%Y-%m-%d)

META_JSON="${WALK_DIR}/meta.json"
WALKS_INDEX="${HOME}/brain/wiki/walks/index.html"
LOG="${HOME}/brain/wiki/log.md"

if [ ! -f "${META_JSON}" ]; then
  echo "ERROR: ${META_JSON} not found" >&2
  exit 1
fi

PR_URL=$(jq -r '.url' "${META_JSON}")
TITLE=$(jq -r '.title' "${META_JSON}")

# ── 1. Update meta.json ───────────────────────────────────────────────────────
jq --arg verdict "${VERDICT}" \
   --arg notes "${NOTES}" \
   --arg date "${TODAY}" \
   '.verdict = $verdict | .your_notes = $notes | .date_closed = $date' \
   "${META_JSON}" > "${META_JSON}.tmp" && mv "${META_JSON}.tmp" "${META_JSON}"

# ── 2. Badge for verdict ──────────────────────────────────────────────────────
case "${VERDICT}" in
  approved)           BADGE_CLASS="badge-done";     BADGE_LABEL="approved" ;;
  changes-requested)  BADGE_CLASS="badge-open";     BADGE_LABEL="changes requested" ;;
  commented)          BADGE_CLASS="badge-building"; BADGE_LABEL="commented" ;;
  *)                  BADGE_CLASS="badge-open";     BADGE_LABEL="${VERDICT}" ;;
esac

BADGE_HTML="<span class=\"badge ${BADGE_CLASS}\">${BADGE_LABEL}</span>"

# ── 3. Patch verdict in index.html using Python (reliable HTML string replace) ──
python3 - "${WALKS_INDEX}" "${PR_NUMBER}" "${BADGE_HTML}" <<'PYEOF'
import sys, re

html_file, pr_num, badge = sys.argv[1], sys.argv[2], sys.argv[3]

with open(html_file, 'r') as f:
    content = f.read()

# Replace the pending badge in the row marked with data-walk-pr="{pr_num}"
# Pattern: finds the verdict td in that row
old = re.search(
    r'(id="walk-pr-' + re.escape(pr_num) + r'"[^>]*>.*?<td[^>]*class="walk-verdict"[^>]*>)'
    r'.*?'
    r'(</td>)',
    content, re.DOTALL
)
if old:
    content = content[:old.start()] + old.group(1) + badge + old.group(2) + content[old.end():]
    with open(html_file, 'w') as f:
        f.write(content)
    print(f"Updated verdict for PR #{pr_num} → {badge}")
else:
    print(f"WARN: row for PR #{pr_num} not found in index — badge not updated", file=sys.stderr)
PYEOF

# ── 4. Append to wiki/log.md ──────────────────────────────────────────────────
printf '\n## [%s] walk | %s | %s\n' "${TODAY}" "${PR_URL}" "${VERDICT}" >> "${LOG}"

# ── 5. Re-index qmd walks collection ─────────────────────────────────────────
if command -v qmd &>/dev/null; then
  qmd update walks 2>/dev/null || true
fi

# ── 6. Commit ─────────────────────────────────────────────────────────────────
git -C "${HOME}/brain" add wiki/walks/ wiki/log.md 2>/dev/null || true
if git -C "${HOME}/brain" diff --cached --quiet; then
  echo "INFO: Nothing staged to commit."
else
  git -C "${HOME}/brain" commit \
    -m "chore: close walk pr-${PR_NUMBER} [${VERDICT}]" 2>/dev/null \
    || echo "WARN: git commit failed (1Password?). Files staged — commit manually." >&2
fi

echo "Walk closed: pr-${PR_NUMBER} [${VERDICT}]"
