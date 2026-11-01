#!/usr/bin/env bash
# send.sh: post a kept "material da semana" draft to the Wiki (Outline), or only check it.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: send.sh --check DRAFT
       send.sh --title TITLE DRAFT [--replace]

--check   exit 3 if DRAFT contains a word from the block list, 0 otherwise. Sends nothing.
--title   create the page TITLE under $INTAKE_PARENT_DOC with DRAFT as its text. If a child page
          with that title exists, it refuses (exit 7) unless --replace, which overwrites it:
          only use --replace when nobody edited the page on the Wiki.
Env: OUTLINE_API_URL (ends in /api), OUTLINE_API_KEY, INTAKE_PARENT_DOC,
     LISTS (default ~/.config/rs-content-intake).
USAGE
}

check=0 title='' replace=0 draft=''
while [ $# -gt 0 ]; do
  case $1 in
    -h|--help) usage; exit 0 ;;
    --check) check=1 ;;
    --title) title=${2:?}; shift ;;
    --replace) replace=1 ;;
    -*) usage >&2; exit 2 ;;
    *) draft=$1 ;;
  esac
  shift
done
[ -f "$draft" ] || { usage >&2; exit 2; }

LISTS=${LISTS:-$HOME/.config/rs-content-intake}
block_re=$(grep -v -E '^\s*(#|$)' "$LISTS/block.txt" 2>/dev/null | sed 's/[][\.*^$+?(){}|/]/\\&/g' | paste -sd '|' - || true)
if [ -n "$block_re" ] && grep -niE "$block_re" "$draft" >/dev/null; then
  echo "send: $draft has a blocked word on line(s) $(grep -niE "$block_re" "$draft" | cut -d: -f1 | paste -sd, -)" >&2
  exit 3
fi
[ "$check" = 1 ] && { echo "send: $draft passes the block list"; exit 0; }

[ -n "$title" ] || { usage >&2; exit 2; }
: "${OUTLINE_API_URL:?}" "${OUTLINE_API_KEY:?}" "${INTAKE_PARENT_DOC:?}"
api() { curl -sf -X POST "$OUTLINE_API_URL/$1" -H "Authorization: Bearer $OUTLINE_API_KEY" \
  -H 'Content-Type: application/json' -d @-; }

parent=$(jq -n --arg i "$INTAKE_PARENT_DOC" '{id:$i}' | api documents.info)
col=$(jq -r .data.collectionId <<<"$parent")
existing=$(jq -n --arg p "$INTAKE_PARENT_DOC" '{parentDocumentId:$p, limit:100}' | api documents.list |
  jq -r --arg t "$title" '.data[] | select(.title == $t) | .id' | head -1)

if [ -n "$existing" ]; then
  [ "$replace" = 1 ] || { echo "send: page \"$title\" exists ($existing); edit it on the Wiki or pass --replace" >&2; exit 7; }
  out=$(jq -n --arg i "$existing" --rawfile x "$draft" '{id:$i, text:$x, publish:true}' | api documents.update)
else
  out=$(jq -n --arg t "$title" --rawfile x "$draft" --arg c "$col" --arg p "$INTAKE_PARENT_DOC" \
    '{title:$t, text:$x, collectionId:$c, parentDocumentId:$p, publish:true}' | api documents.create)
fi
echo "send: $(jq -r '.data.title + " " + .data.url' <<<"$out")"
