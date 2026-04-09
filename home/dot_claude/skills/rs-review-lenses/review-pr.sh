#!/usr/bin/env bash
set -euo pipefail

# review-pr.sh — Dispatch a headless review-lenses session for a PR
#
# Usage:
#   review-pr.sh <PR_URL>
#   review-pr.sh --poll <org/repo>   # review all open PRs requesting your review
#
# Examples:
#   review-pr.sh https://github.com/acme/app/pull/1234
#   review-pr.sh --poll acme/app

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REVIEW_BASE="/tmp"

usage() {
  echo "Usage: review-pr.sh <PR_URL>"
  echo "       review-pr.sh --poll <org/repo>"
  exit 1
}

# Extract ticket from branch name or PR title (e.g., PROJ-1392)
extract_ticket() {
  local text="$1"
  echo "$text" | grep -oE '[A-Z]+-[0-9]+' | head -1
}

# Parse PR URL → org, repo, number
parse_pr_url() {
  local url="$1"
  url="${url%/}"
  if [[ "$url" =~ github\.com/([^/]+)/([^/]+)/pull/([0-9]+) ]]; then
    PR_ORG="${BASH_REMATCH[1]}"
    PR_REPO="${BASH_REMATCH[2]}"
    PR_NUMBER="${BASH_REMATCH[3]}"
  else
    echo "Error: Invalid PR URL: $url" >&2
    exit 1
  fi
}

# Fetch minimal PR metadata (title + branch) for session naming
fetch_pr_meta() {
  local org="$1" repo="$2" number="$3"
  PR_TITLE="$(gh pr view "$number" --repo "$org/$repo" --json title --jq .title 2>/dev/null || echo "PR #$number")"
  PR_BRANCH="$(gh pr view "$number" --repo "$org/$repo" --json headRefName --jq .headRefName 2>/dev/null || echo "")"
}

# Determine session name from ticket or PR number
session_name() {
  local ticket
  ticket="$(extract_ticket "$PR_BRANCH")"
  if [[ -z "$ticket" ]]; then
    ticket="$(extract_ticket "$PR_TITLE")"
  fi
  if [[ -n "$ticket" ]]; then
    echo "Review / $ticket"
  else
    echo "Review / PR-$PR_NUMBER"
  fi
}

# Check if a review already exists for this PR
review_exists() {
  local review_dir="$REVIEW_BASE/review-$1"
  [[ -f "$review_dir/REVIEW.md" ]]
}

# Run review-lenses for a single PR
review_single() {
  local url="$1"
  parse_pr_url "$url"
  fetch_pr_meta "$PR_ORG" "$PR_REPO" "$PR_NUMBER"

  if review_exists "$PR_NUMBER"; then
    echo "Review already exists: $REVIEW_BASE/review-$PR_NUMBER/REVIEW.md — skipping"
    return 0
  fi

  local name
  name="$(session_name)"

  echo "Dispatching review: $name ($url)"

  claude -p \
    --name "$name" \
    --permission-mode bypassPermissions \
    --model sonnet \
    "/review-lenses $url"
}

# TODO: Poll mode — find open PRs requesting your review, dispatch reviews for each
# poll_repo() {
#   local repo="$1"
#   echo "Polling $repo for PRs requesting your review..."
#   local prs
#   prs="$(gh pr list --repo "$repo" --reviewer @me --state open --json number,url --jq '.[].url' 2>/dev/null || true)"
#   if [[ -z "$prs" ]]; then
#     echo "No open PRs requesting your review in $repo"
#     return 0
#   fi
#   local count=0
#   while IFS= read -r pr_url; do
#     [[ -z "$pr_url" ]] && continue
#     local pr_num
#     pr_num="$(echo "$pr_url" | grep -oE '[0-9]+$')"
#     if review_exists "$pr_num"; then
#       echo "  Skip PR #$pr_num — review already exists"
#       continue
#     fi
#     review_single "$pr_url" &
#     count=$((count + 1))
#     if (( count % 3 == 0 )); then
#       wait
#     fi
#   done <<< "$prs"
#   wait
#   echo "Done. Dispatched $count review(s)."
# }

# --- Main ---

if [[ $# -lt 1 ]]; then
  usage
fi

case "$1" in
  # --poll)
  #   [[ $# -lt 2 ]] && usage
  #   poll_repo "$2"
  #   ;;
  --help|-h)
    usage
    ;;
  *)
    review_single "$1"
    ;;
esac
