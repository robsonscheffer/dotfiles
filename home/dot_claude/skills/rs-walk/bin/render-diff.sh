#!/usr/bin/env bash
# rs-walk render-diff — extracts one file's hunks from a unified diff and renders
# them as .diff-block inner HTML (without the outer wrapper div).
#
# Usage: render-diff.sh <diff-file> <filepath> [max-lines]
#   diff-file   path to the full pr diff (gh pr diff output)
#   filepath    the file path as it appears in the diff (e.g. "src/foo/bar.ts")
#   max-lines   cap on rendered lines, default 80
#
# Output: raw HTML lines ready to insert inside a <div class="diff-block">
set -euo pipefail

DIFF_FILE="${1:?usage: render-diff.sh <diff-file> <filepath> [max-lines]}"
FILEPATH="${2:?usage: render-diff.sh <diff-file> <filepath> [max-lines]}"
MAX_LINES="${3:-80}"

html_escape() {
  # Use sed — bash parameter expansion treats & as backreference in replacements
  printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g'
}

# Extract this file's diff section using awk.
# Matches from the diff --git header containing FILEPATH to the next diff --git line.
FILE_DIFF=$(awk -v fp="${FILEPATH}" '
  /^diff --git / {
    in_file = (index($0, fp) > 0)
    next
  }
  in_file {
    # Skip file metadata lines — only emit hunk headers and content
    if (/^index |^--- |^\+\+\+ |^new file mode|^deleted file mode|^similarity|^rename|^Binary/) next
    print
  }
' "${DIFF_FILE}")

if [ -z "${FILE_DIFF}" ]; then
  printf '<div class="diff-line context" style="color:var(--mate-frame-muted);font-style:italic;">No diff found for %s</div>\n' \
    "$(html_escape "${FILEPATH}")"
  exit 0
fi

# Count lines before truncation
TOTAL_LINES=$(printf '%s\n' "${FILE_DIFF}" | wc -l | tr -d ' ')
TRUNCATED=false
if [ "${TOTAL_LINES}" -gt "${MAX_LINES}" ]; then
  TRUNCATED=true
  FILE_DIFF=$(printf '%s\n' "${FILE_DIFF}" | head -n "${MAX_LINES}")
fi

# Render each line using .diff-prefix + .diff-line-code inner structure
# (matches the DS CSS which applies colors via .diff-prefix and .diff-line-code selectors)
while IFS= read -r line; do
  first_char="${line:0:1}"
  rest="${line:1}"
  case "${first_char}" in
    "+")
      PREFIX=$(html_escape "+")
      CODE=$(html_escape "${rest}")
      printf '<div class="diff-line added"><span class="diff-prefix">%s</span><span class="diff-line-code">%s</span></div>\n' "${PREFIX}" "${CODE}"
      ;;
    "-")
      PREFIX=$(html_escape "-")
      CODE=$(html_escape "${rest}")
      printf '<div class="diff-line removed"><span class="diff-prefix">%s</span><span class="diff-line-code">%s</span></div>\n' "${PREFIX}" "${CODE}"
      ;;
    "@")
      ESCAPED=$(html_escape "${line}")
      printf '<div class="diff-hunk-header"><span class="diff-line-code">%s</span></div>\n' "${ESCAPED}"
      ;;
    *)
      CODE=$(html_escape "${rest}")
      printf '<div class="diff-line context"><span class="diff-prefix"> </span><span class="diff-line-code">%s</span></div>\n' "${CODE}"
      ;;
  esac
done <<< "${FILE_DIFF}"

if [ "${TRUNCATED}" = true ]; then
  REMAINING=$(( TOTAL_LINES - MAX_LINES ))
  printf '<div class="diff-line context"><span class="diff-prefix"> </span><span class="diff-line-code" style="color:var(--mate-frame-muted);font-style:italic;">[&#x2026; %d more lines not shown]</span></div>\n' \
    "${REMAINING}"
fi
