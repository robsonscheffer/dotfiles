#!/usr/bin/env bash
# rs-walk fetch-pr — fetches PR metadata, body, diff, and file list for a walk.
#
# Fetches `body` separately from the structured --json call: PR bodies routinely
# contain control characters (pasted rich text, emoji, embedded HTML comments)
# that break `jq` when bundled into the same JSON blob as title/author/etc.
#
# Usage: fetch-pr.sh <repo> <pr-number>
#   repo        org/repo, e.g. octocat/hello-world
#   pr-number   PR number, e.g. 66956
#
# Writes to /tmp/:
#   walk-<pr>-meta.json   — number,title,author,headRefName,baseRefName,additions,deletions,changedFiles,url
#   walk-<pr>-body.txt    — raw PR body text
#   walk-<pr>.diff        — full unified diff, untruncated
#   walk-<pr>-files.txt   — changed file paths, one per line
#
# Prints the four paths to stdout, one per line, in that order.
set -euo pipefail

REPO="${1:?usage: fetch-pr.sh <repo> <pr-number>}"
PR_NUMBER="${2:?usage: fetch-pr.sh <repo> <pr-number>}"

META_JSON="/tmp/walk-${PR_NUMBER}-meta.json"
BODY_TXT="/tmp/walk-${PR_NUMBER}-body.txt"
DIFF_FILE="/tmp/walk-${PR_NUMBER}.diff"
FILES_TXT="/tmp/walk-${PR_NUMBER}-files.txt"

if ! gh pr view "${PR_NUMBER}" --repo "${REPO}" \
     --json "number,title,author,headRefName,baseRefName,additions,deletions,changedFiles,url" \
     > "${META_JSON}"; then
  echo "ERROR: gh pr view failed for ${REPO}#${PR_NUMBER}" >&2
  exit 1
fi

if ! gh pr view "${PR_NUMBER}" --repo "${REPO}" --json body -q .body > "${BODY_TXT}"; then
  echo "ERROR: gh pr view (body) failed for ${REPO}#${PR_NUMBER}" >&2
  exit 1
fi

if ! gh pr diff "${PR_NUMBER}" --repo "${REPO}" > "${DIFF_FILE}"; then
  echo "ERROR: gh pr diff failed for ${REPO}#${PR_NUMBER}" >&2
  exit 1
fi

gh pr diff "${PR_NUMBER}" --repo "${REPO}" --name-only > "${FILES_TXT}"

echo "${META_JSON}"
echo "${BODY_TXT}"
echo "${DIFF_FILE}"
echo "${FILES_TXT}"
