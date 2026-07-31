#!/usr/bin/env bash
# rs-walk build-assets — splices assets/style/index.css into a single stylesheet
# by replacing each `/* INCLUDE: path */` marker with that file's contents.
#
# Usage: build-assets.sh [output-path]
#   output-path  defaults to assets/walk.css
#
# Output path is $1 so this matches the verify-bundle contract: rebuild into a
# temp dir, diff against the committed artifact, fail on drift.
set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTRY="${SKILL_ROOT}/assets/style/index.css"
OUT="${1:-${SKILL_ROOT}/assets/walk.css}"

[ -f "${ENTRY}" ] || {
  echo "ERROR: entry stylesheet missing at ${ENTRY}" >&2
  exit 1
}

TMP=$(mktemp)
trap 'rm -f "${TMP}"' EXIT

while IFS= read -r line; do
  # /* INCLUDE: style/tokens.css */ — path is relative to assets/
  # No lazy quantifiers — macOS ships bash 3, whose ERE has no `+?`.
  if [[ "${line}" =~ ^[[:space:]]*/\*[[:space:]]*INCLUDE:[[:space:]]*([^[:space:]]+)[[:space:]]*\*/ ]]; then
    inc="${SKILL_ROOT}/assets/${BASH_REMATCH[1]}"
    if [ ! -f "${inc}" ]; then
      echo "ERROR: include not found: ${inc}" >&2
      exit 1
    fi
    printf '/* --- %s --- */\n' "${BASH_REMATCH[1]}" >>"${TMP}"
    cat "${inc}" >>"${TMP}"
    printf '\n' >>"${TMP}"
  else
    printf '%s\n' "${line}" >>"${TMP}"
  fi
done <"${ENTRY}"

mkdir -p "$(dirname "${OUT}")"
mv "${TMP}" "${OUT}"
chmod 644 "${OUT}" # mktemp gives 600; this is a committed asset
trap - EXIT

echo "Built ${OUT} ($(wc -c <"${OUT}" | tr -d ' ') bytes)"
