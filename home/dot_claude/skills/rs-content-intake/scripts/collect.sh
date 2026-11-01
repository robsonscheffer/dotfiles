#!/usr/bin/env bash
# collect.sh: print last week's work as JSON lines, one item per line, for rs-content-intake.
# Each item: {source, date, title, detail, link, class}. class is "allow" (full text may go out)
# or "review" (title only until a person keeps it). Items that match the block list are dropped
# here and only counted on stderr, so they never reach the draft.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: collect.sh [--days N]

Reads the last N days (default 7) from:
  sessions   $BRAIN/obah/sessions/INDEX.md rows
  reports    $BRAIN/wiki/artifact/report/YYYY-MM-DD-* folders
  handoffs   $BRAIN/.scratch/handoffs/*/*.md (topic and next)
  git        commit subjects of every repo under $APPS/*/* (worktrees skipped)
  voice      OpenWhispr transcriptions (openwhispr CLI, desktop app running)
Lists: $LISTS/block.txt and $LISTS/allow.txt, one case-insensitive word or phrase per line,
"#" starts a comment. Created empty on first run.
Env: BRAIN (default ~/brain), APPS (default ~/apps), LISTS (default ~/.config/rs-content-intake).
USAGE
}

days=7
while [ $# -gt 0 ]; do
  case $1 in
    -h|--help) usage; exit 0 ;;
    --days) days=${2:?}; shift ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

BRAIN=${BRAIN:-$HOME/brain}
APPS=${APPS:-$HOME/apps}
LISTS=${LISTS:-$HOME/.config/rs-content-intake}
since=$(date -v-"${days}"d +%Y-%m-%d)

mkdir -p "$LISTS"
for f in block allow; do
  [ -f "$LISTS/$f.txt" ] || printf '# one word or phrase per line, case-insensitive\n' >"$LISTS/$f.txt"
done
# a list file becomes one regex; an empty list matches nothing
list_re() { grep -v -E '^\s*(#|$)' "$1" | sed 's/[][\.*^$+?(){}|/]/\\&/g' | paste -sd '|' - || true; }
block_re=$(list_re "$LISTS/block.txt")
allow_re=$(list_re "$LISTS/allow.txt")

# loops below run in pipes (subshells), so the blocked count goes through a file
blocked_file=$(mktemp); trap 'rm -f "$blocked_file"' EXIT
emit() { # source date title detail link
  local all="$3 $4 $5" class=review
  if [ -n "$block_re" ] && grep -qiE "$block_re" <<<"$all"; then
    echo x >>"$blocked_file"; return 0
  fi
  if [ -n "$allow_re" ] && grep -qiE "$allow_re" <<<"$all"; then class=allow; fi
  jq -nc --arg s "$1" --arg d "$2" --arg t "$3" --arg x "$4" --arg l "$5" --arg c "$class" \
    '{source:$s, date:$d, title:$t, detail:$x, link:$l, class:$c}'
}

# sessions: "| 2026-10-31 | [Title](file.md) | summary |"
idx="$BRAIN/obah/sessions/INDEX.md"
if [ -f "$idx" ]; then
  grep -E '^\| [0-9]{4}-[0-9]{2}-[0-9]{2} \|' "$idx" | while IFS='|' read -r _ d s sum _; do
    d=$(xargs <<<"$d")
    [[ "$d" < "$since" ]] && continue
    t=$(sed -E 's/^ *\[(.*)\]\((.*)\) *$/\1/' <<<"$s")
    f=$(sed -E 's/^ *\[(.*)\]\((.*)\) *$/\2/' <<<"$s")
    emit session "$d" "$t" "$(xargs -0 <<<"$sum")" "$BRAIN/obah/sessions/$f"
  done
fi

# reports: folder names carry the date
for dir in "$BRAIN"/wiki/artifact/report/[0-9][0-9][0-9][0-9]-*; do
  [ -d "$dir" ] || continue
  n=$(basename "$dir"); d=${n:0:10}
  [[ "$d" < "$since" ]] && continue
  t=$(grep -o -m1 '<title>[^<]*' "$dir/index.html" 2>/dev/null | sed 's/<title>//' || true)
  emit report "$d" "${t:-${n:11}}" "" "$dir"
done

# handoffs: topic and next from the frontmatter
for f in "$BRAIN"/.scratch/handoffs/*/[0-9]*.md; do
  [ -f "$f" ] || continue
  n=$(basename "$f"); d=${n:0:10}
  [[ "$d" < "$since" ]] && continue
  topic=$(sed -n 's/^topic: *//p' "$f" | head -1)
  next=$(sed -n 's/^next: *//p' "$f" | head -1 | sed 's/^"//; s/"$//')
  emit handoff "$d" "$(basename "$(dirname "$f")"): ${topic:-${n:11}}" "$next" "$f"
done

# git: commit subjects per repo, worktrees skipped (they repeat their main repo)
for repo in "$APPS"/*/*; do
  [ -d "$repo/.git" ] || continue
  case $repo in *-wt-*|*/temp/*) continue ;; esac
  git -C "$repo" log --since="$since" --no-merges --format='%ad%x09%s' --date=short 2>/dev/null |
    while IFS=$'\t' read -r d s; do
      emit git "$d" "$(basename "$repo"): $s" "" "$repo"
    done
done

# voice: OpenWhispr transcriptions; a note that starts with "ideia" is marked in the title
if command -v openwhispr >/dev/null 2>&1; then
  openwhispr --local transcriptions list --limit 200 --format json 2>/dev/null |
    jq -r --arg since "$since" '.[] | select(.deleted_at == null and .created_at[0:10] >= $since)
      | [.created_at[0:10], (.text | gsub("[\t\n]"; " "))] | @tsv' 2>/dev/null |
    while IFS=$'\t' read -r d x; do
      case $(tr '[:upper:]' '[:lower:]' <<<"${x:0:8}") in ideia*) t="ideia: ${x:0:80}" ;; *) t="nota: ${x:0:80}" ;; esac
      emit voice "$d" "$t" "$x" ""
    done
fi

echo "collect: since $since, block list dropped $(wc -l <"$blocked_file" | tr -d ' ') item(s)" >&2
