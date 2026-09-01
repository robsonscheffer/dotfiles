#!/usr/bin/env bash
# rs-walk fetch-pr-comments — fetches PR issue comments + review bodies for
# comment-triage classification (Agent 6). Its own gh call, same reason
# fetch-pr.sh fetches body separately: bot review bodies are dense with
# control characters, emoji, and embedded HTML <details> blocks that break
# `jq` when bundled into the main --json call.
#
# Non-fatal by design: comment triage is supplementary. If the gh call fails
# (rate limit, transient network), this writes an empty {"comments":[],
# "reviews":[]} and exits 0 rather than aborting the whole walk — Step 4
# skips Agent 6 and Step 5 renders the "no comments yet" fallback.
#
# Usage: fetch-pr-comments.sh <repo> <pr-number>
#
# Writes /tmp/walk-<pr>-raw-comments.json: {"comments":[...],"reviews":[...]}
# Prints the path to stdout.
set -uo pipefail

REPO="${1:?usage: fetch-pr-comments.sh <repo> <pr-number>}"
PR_NUMBER="${2:?usage: fetch-pr-comments.sh <repo> <pr-number>}"

RAW_JSON="/tmp/walk-${PR_NUMBER}-raw-comments.json"

if ! gh pr view "${PR_NUMBER}" --repo "${REPO}" --json comments,reviews > "${RAW_JSON}" 2>/tmp/walk-${PR_NUMBER}-comments-fetch.err; then
  echo "WARNING: gh pr view (comments,reviews) failed for ${REPO}#${PR_NUMBER} — continuing without prior-discussion data." >&2
  cat "/tmp/walk-${PR_NUMBER}-comments-fetch.err" >&2 || true
  echo '{"comments":[],"reviews":[]}' > "${RAW_JSON}"
fi

echo "${RAW_JSON}"
