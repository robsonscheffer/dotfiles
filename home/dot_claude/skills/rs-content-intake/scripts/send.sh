#!/usr/bin/env bash
# send.sh: post a kept week entry as a child of the changelog index page, or only check it.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: send.sh --check ENTRY
       send.sh ENTRY

--check   exit 3 if ENTRY contains a word from the block list, 0 otherwise. Sends nothing.
(none)    create the page "<index title> semana <n>" under the changelog index $INTAKE_PAGE and
          list it at the top of the index's "## Semanas" section. ENTRY starts with its
          "## Semana <n> (<dates>)" heading. If that week's page exists it refuses (exit 7):
          edit the page on the Wiki instead.
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

heading=$(head -1 "$entry")
label=${heading#'## '}
week=$(sed -nE 's/^Semana ([0-9]+).*/\1/p' <<<"$label")
dates=$(sed -nE 's/^Semana [0-9]+ \((.*)\)$/\1/p' <<<"$label")
[ -n "$week" ] || { echo "send: line 1 of $entry must be \"## Semana <n> (<dates>)\"" >&2; exit 2; }
: "${OUTLINE_API_URL:?}" "${OUTLINE_API_KEY:?}" "${INTAKE_PAGE:?}"
api() { curl -sf -X POST "$OUTLINE_API_URL/$1" -H "Authorization: Bearer $OUTLINE_API_KEY" \
  -H 'Content-Type: application/json' -d @-; }

index=$(jq -n --arg i "$INTAKE_PAGE" '{id:$i}' | api documents.info)
title="$(jq -r .data.title <<<"$index") semana $week"
existing=$(jq -n --arg p "$INTAKE_PAGE" '{parentDocumentId:$p, limit:100}' | api documents.list |
  jq -r --arg t "$title" '.data[] | select(.title == $t) | .url' | head -1)
[ -z "$existing" ] || { echo "send: \"$title\" exists ($existing); edit it on the Wiki" >&2; exit 7; }

text=$(printf '**Período:** %s\n\n%s\n' "$dates" "$(tail -n +2 "$entry" | sed '/./,$!d')")
page=$(jq -n --arg t "$title" --arg x "$text" --arg c "$(jq -r .data.collectionId <<<"$index")" \
  --arg p "$INTAKE_PAGE" '{title:$t, text:$x, collectionId:$c, parentDocumentId:$p, publish:true}' |
  api documents.create)
url=$(jq -r .data.url <<<"$page")

# List the new week first under "## Semanas". Start from the live text: people edit the index.
row="* [$label]($url)"
itext=$(jq -r .data.text <<<"$index" | awk -v r="$row" '
  skip && /^$/ { skip = 0; next }
  { skip = 0; print }
  /^## Semanas$/ { print ""; print r; done = 1; skip = 1 }
  END { if (!done) { print ""; print "## Semanas"; print ""; print r } }')
jq -n --arg i "$INTAKE_PAGE" --arg x "$itext" '{id:$i, text:$x, publish:true}' | api documents.update >/dev/null
echo "send: created \"$title\" $url and listed it on the index"
