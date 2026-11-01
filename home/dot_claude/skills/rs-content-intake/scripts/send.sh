#!/usr/bin/env bash
# send.sh: add a kept week entry to the changelog page on the Wiki (Outline), or only check it.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: send.sh --check ENTRY
       send.sh ENTRY

--check   exit 3 if ENTRY contains a word from the block list, 0 otherwise. Sends nothing.
(none)    insert ENTRY at the top of the changelog page $INTAKE_PAGE, above the newest week.
          ENTRY starts with its "## Semana <n>" heading; if the page already has that heading
          it refuses (exit 7): edit the page on the Wiki instead.
Env: OUTLINE_API_URL (ends in /api), OUTLINE_API_KEY, INTAKE_PAGE,
     LISTS (default ~/.config/rs-content-intake).
USAGE
}

check=0 entry=''
while [ $# -gt 0 ]; do
  case $1 in
    -h|--help) usage; exit 0 ;;
    --check) check=1 ;;
    -*) usage >&2; exit 2 ;;
    *) entry=$1 ;;
  esac
  shift
done
[ -f "$entry" ] || { usage >&2; exit 2; }

LISTS=${LISTS:-$HOME/.config/rs-content-intake}
block_re=$(grep -v -E '^\s*(#|$)' "$LISTS/block.txt" 2>/dev/null | sed 's/[][\.*^$+?(){}|/]/\\&/g' | paste -sd '|' - || true)
if [ -n "$block_re" ] && grep -niE "$block_re" "$entry" >/dev/null; then
  echo "send: $entry has a blocked word on line(s) $(grep -niE "$block_re" "$entry" | cut -d: -f1 | paste -sd, -)" >&2
  exit 3
fi
[ "$check" = 1 ] && { echo "send: $entry passes the block list"; exit 0; }

heading=$(grep -m1 '^## ' "$entry" || true)
[ -n "$heading" ] || { echo "send: $entry has no '## Semana <n>' heading" >&2; exit 2; }
: "${OUTLINE_API_URL:?}" "${OUTLINE_API_KEY:?}" "${INTAKE_PAGE:?}"
api() { curl -sf -X POST "$OUTLINE_API_URL/$1" -H "Authorization: Bearer $OUTLINE_API_KEY" \
  -H 'Content-Type: application/json' -d @-; }

# Always start from the live text: people edit the page between sends.
live=$(jq -n --arg i "$INTAKE_PAGE" '{id:$i}' | api documents.info | jq -r .data.text)
if grep -qxF "$heading" <<<"$live"; then
  echo "send: the page already has \"$heading\"; edit it on the Wiki" >&2
  exit 7
fi

# New entry goes above the first "## " heading, below the page intro.
text=$(awk -v f="$entry" '
  !done && /^## / { while ((getline l < f) > 0) print l; print ""; done = 1 }
  { print }
  END { if (!done) { print ""; while ((getline l < f) > 0) print l } }' <<<"$live")
out=$(jq -n --arg i "$INTAKE_PAGE" --arg x "$text" '{id:$i, text:$x, publish:true}' | api documents.update)
echo "send: added \"$heading\" to $(jq -r '.data.title + " " + .data.url' <<<"$out")"
