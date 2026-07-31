#!/usr/bin/env bash
# rs-walk close-walk — seals a completed walk: updates meta.json, patches the
# verdict badge in the index, appends wiki/log.md, re-indexes qmd, commits.
#
# Usage: close-walk.sh <walk-dir> <pr-number> <verdict> [notes]
#   verdict: approved | changes-requested | commented
set -euo pipefail

WALK_DIR="${1:?usage: close-walk.sh <walk-dir> <pr-number> <verdict> [notes] [section-notes.json]}"
PR_NUMBER="${2:?missing pr-number}"
VERDICT="${3:?missing verdict}"
NOTES="${4:-}"
SECTION_NOTES="${5:-}"
TODAY=$(date +%Y-%m-%d)

META_JSON="${WALK_DIR}/meta.json"
WALKS_INDEX="${HOME}/brain/wiki/walks/index.html"
ARTIFACTS_JSON="${HOME}/brain/wiki/artifact/artifacts.json"
LOG="${HOME}/brain/wiki/log.md"

if [ ! -f "${META_JSON}" ]; then
  echo "ERROR: ${META_JSON} not found" >&2
  exit 1
fi

PR_URL=$(jq -r '.url' "${META_JSON}")

# ── 1. Update meta.json ───────────────────────────────────────────────────────
# your_notes is the overall comment; section_notes is what was typed per section
# while reading, recovered from the browser rather than retyped at the end.
if [ -n "${SECTION_NOTES}" ] && [ -f "${SECTION_NOTES}" ]; then
  SECTION_JSON=$(jq -c '.notes // .' "${SECTION_NOTES}")
else
  SECTION_JSON='{}'
fi

jq --arg verdict "${VERDICT}" \
   --arg notes "${NOTES}" \
   --arg date "${TODAY}" \
   --argjson sections "${SECTION_JSON}" \
   '.verdict = $verdict | .your_notes = $notes | .section_notes = $sections | .date_closed = $date' \
   "${META_JSON}" > "${META_JSON}.tmp" && mv "${META_JSON}.tmp" "${META_JSON}"

# ── 2. Badge for verdict ──────────────────────────────────────────────────────
case "${VERDICT}" in
  approved)           BADGE_CLASS="badge-done";     BADGE_LABEL="approved" ;;
  changes-requested)  BADGE_CLASS="badge-open";     BADGE_LABEL="changes requested" ;;
  commented)          BADGE_CLASS="badge-building"; BADGE_LABEL="commented" ;;
  *)                  BADGE_CLASS="badge-open";     BADGE_LABEL="${VERDICT}" ;;
esac

BADGE_HTML="<span class=\"badge ${BADGE_CLASS}\">${BADGE_LABEL}</span>"

# ── 3. Patch verdict badge ────────────────────────────────────────────────────
# artifacts.json has no verdict/badge field (title|type|tier|created|url|file) —
# if the walk lives there, fold the verdict into the title instead of skipping silently.
if [ -f "${ARTIFACTS_JSON}" ] && jq -e --arg pr "pr-${PR_NUMBER}-" \
     '.[] | select(.type == "walk" and (.file | contains($pr)))' "${ARTIFACTS_JSON}" >/dev/null 2>&1; then
  jq --arg pr "pr-${PR_NUMBER}-" --arg label "${BADGE_LABEL}" \
     'map(if .type == "walk" and (.file | contains($pr)) and (.title | contains($label) | not)
          then .title = .title + " [" + $label + "]" else . end)' \
     "${ARTIFACTS_JSON}" > "${ARTIFACTS_JSON}.tmp" && mv "${ARTIFACTS_JSON}.tmp" "${ARTIFACTS_JSON}"
  echo "Updated verdict for PR #${PR_NUMBER} in artifacts.json → ${BADGE_LABEL}"
else

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

fi

# ── 4. Append to wiki/log.md ──────────────────────────────────────────────────
printf '\n## [%s] walk | %s | %s\n' "${TODAY}" "${PR_URL}" "${VERDICT}" >> "${LOG}"

# ── 5. Re-index qmd walks collection ─────────────────────────────────────────
if command -v qmd &>/dev/null; then
  qmd update walks 2>/dev/null || true
fi

# ── 6. Commit ─────────────────────────────────────────────────────────────────
git -C "${HOME}/brain" add wiki/walks/ wiki/log.md wiki/artifact/artifacts.json 2>/dev/null || true
if git -C "${HOME}/brain" diff --cached --quiet; then
  echo "INFO: Nothing staged to commit."
else
  git -C "${HOME}/brain" commit \
    -m "chore: close walk pr-${PR_NUMBER} [${VERDICT}]" 2>/dev/null \
    || echo "WARN: git commit failed (1Password?). Files staged — commit manually." >&2
fi

echo "Walk closed: pr-${PR_NUMBER} [${VERDICT}]"
