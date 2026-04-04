#!/usr/bin/env python3
"""
Fetch PR data from GitHub for lens-based review.
Usage: fetch-pr-data.py <PR_URL> [--save-to <DIR>]

Options:
  --save-to <DIR>  Save to directory: PR-DATA.json + PR.diff (creates dirs if needed)

Without --save-to, prints JSON to stdout with diff inline (truncated at ~100KB).

Output (JSON):
  {
    "org", "repo", "pr_number", "url",
    "state", "is_draft", "mergeable",
    "created_at", "updated_at",
    "title", "body", "author",
    "head_branch", "base_branch",
    "labels": [...],
    "assignees": [...],
    "requested_reviewers": [...],
    "files": [{"path", "additions", "deletions"}, ...],
    "stats": {"files", "additions", "deletions"},
    "commits": [{"sha", "message", "author"}, ...],
    "comments": [{"author", "body", "created_at"}, ...],
    "reviews": [{"author", "state", "body", "submitted_at"}, ...],
    "review_comments": [{"id", "author", "body", "path", "line", "side",
                          "in_reply_to_id", "created_at", "updated_at"}, ...],
    "status_checks": [{"name", "status", "conclusion"}, ...],
    "diff_file": "PR.diff" (if --save-to used),
    "diff_truncated": true/false,
    "fetched_at": "ISO timestamp"
  }
  or {"error": "..."}
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse

# Max diff size (~100KB) - truncate cleanly at file boundaries
MAX_DIFF_SIZE = 100_000


def main():
    if len(sys.argv) < 2:
        print('{"error":"Usage: fetch-pr-data.py <PR_URL> [--save-to <DIR>]"}')
        return

    args = sys.argv[1:]
    save_to = None
    url = None

    i = 0
    while i < len(args):
        if args[i] == '--save-to' and i + 1 < len(args):
            save_to = args[i + 1]
            i += 2
        elif not url:
            url = args[i]
            i += 1
        else:
            i += 1

    if not url:
        print('{"error":"Usage: fetch-pr-data.py <PR_URL> [--save-to <DIR>]"}')
        return

    parsed = parse_pr_url(url)
    if not parsed:
        print('{"error":"Invalid PR URL. Expected: https://github.com/org/repo/pull/123"}')
        return

    org, repo, pr_number = parsed

    pr_data = fetch_pr_details(org, repo, pr_number)
    if "error" in pr_data:
        print(json.dumps(pr_data))
        return

    diff, truncated = fetch_diff(org, repo, pr_number)
    pr_data["diff_truncated"] = truncated
    pr_data["fetched_at"] = datetime.now(timezone.utc).isoformat()

    if save_to:
        try:
            save_dir = os.path.expanduser(save_to)
            os.makedirs(save_dir, exist_ok=True)

            pr_data["diff_file"] = "PR.diff"
            with open(os.path.join(save_dir, "PR-DATA.json"), 'w') as f:
                json.dump(pr_data, f, indent=2)

            if diff:
                with open(os.path.join(save_dir, "PR.diff"), 'w') as f:
                    f.write(diff)

            pr_data["saved_to"] = save_dir
        except (OSError, IOError) as e:
            pr_data["save_error"] = str(e)

    print(json.dumps(pr_data))


def parse_pr_url(url: str) -> tuple[str, str, int] | None:
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    parsed = urlparse(url)
    path_parts = [p for p in parsed.path.split('/') if p]
    if len(path_parts) < 4 or path_parts[2] != 'pull':
        return None
    try:
        return path_parts[0], path_parts[1], int(path_parts[3])
    except ValueError:
        return None


def fetch_pr_details(org: str, repo: str, pr_number: int) -> dict:
    try:
        fields = ','.join([
            'title', 'body', 'headRefName', 'baseRefName',
            'files', 'additions', 'deletions', 'author', 'url',
            'comments', 'reviews', 'commits',
            'labels', 'assignees', 'reviewRequests',
            'statusCheckRollup', 'state', 'isDraft', 'mergeable',
            'createdAt', 'updatedAt'
        ])

        result = subprocess.run(
            ['gh', 'pr', 'view', str(pr_number),
             '--repo', f'{org}/{repo}', '--json', fields],
            capture_output=True, text=True, timeout=30
        )

        if result.returncode != 0:
            error = result.stderr.strip() or "gh CLI failed"
            if "Could not resolve" in error or "not found" in error.lower():
                return {"error": f"PR not found: {org}/{repo}#{pr_number}"}
            if "gh auth" in error.lower():
                return {"error": "gh CLI not authenticated. Run: gh auth login"}
            return {"error": f"gh CLI error: {error}"}

        data = json.loads(result.stdout)
        files = data.get("files") or []
        comments = data.get("comments") or []
        reviews = data.get("reviews") or []
        commits = data.get("commits") or []
        labels = data.get("labels") or []
        assignees = data.get("assignees") or []
        review_requests = data.get("reviewRequests") or []
        status_checks = data.get("statusCheckRollup") or []

        # Fetch inline review comments (line-level comments on the diff)
        review_comments = fetch_review_comments(org, repo, pr_number)

        return {
            "org": org, "repo": repo, "pr_number": pr_number,
            "url": data.get("url", f"https://github.com/{org}/{repo}/pull/{pr_number}"),
            "state": data.get("state", "UNKNOWN"),
            "is_draft": data.get("isDraft", False),
            "mergeable": data.get("mergeable", "UNKNOWN"),
            "created_at": data.get("createdAt"),
            "updated_at": data.get("updatedAt"),
            "title": data.get("title", ""),
            "body": data.get("body", ""),
            "author": data.get("author", {}).get("login", "unknown"),
            "head_branch": data.get("headRefName", ""),
            "base_branch": data.get("baseRefName", ""),
            "labels": [l.get("name", "") for l in labels],
            "assignees": [a.get("login", "") for a in assignees],
            "requested_reviewers": [r.get("login", "") for r in review_requests],
            "files": [
                {"path": f.get("path", ""), "additions": f.get("additions", 0),
                 "deletions": f.get("deletions", 0)}
                for f in files
            ],
            "stats": {
                "files": len(files),
                "additions": data.get("additions", 0),
                "deletions": data.get("deletions", 0)
            },
            "commits": [
                {"sha": c.get("oid", "")[:7],
                 "message": (c.get("messageHeadline") or c.get("message", "")).split('\n')[0],
                 "author": c.get("authors", [{}])[0].get("login", "") if c.get("authors") else ""}
                for c in commits
            ],
            "comments": [
                {"author": c.get("author", {}).get("login", "unknown"),
                 "body": c.get("body", ""), "created_at": c.get("createdAt")}
                for c in comments
            ],
            "reviews": [
                {"author": r.get("author", {}).get("login", "unknown"),
                 "state": r.get("state", ""), "body": r.get("body", ""),
                 "submitted_at": r.get("submittedAt")}
                for r in reviews
            ],
            "review_comments": review_comments,
            "status_checks": [
                {"name": s.get("name", ""), "status": s.get("status", ""),
                 "conclusion": s.get("conclusion", "")}
                for s in status_checks
            ]
        }

    except subprocess.TimeoutExpired:
        return {"error": "gh CLI timed out"}
    except FileNotFoundError:
        return {"error": "gh CLI not installed. Install: https://cli.github.com/"}
    except json.JSONDecodeError:
        return {"error": "Failed to parse gh CLI output"}


def fetch_review_comments(org: str, repo: str, pr_number: int) -> list[dict]:
    """Fetch inline review comments (line-level comments on the diff) via REST API."""
    try:
        comments = []
        page = 1
        while True:
            result = subprocess.run(
                ['gh', 'api', '--paginate',
                 f'repos/{org}/{repo}/pulls/{pr_number}/comments?per_page=100'],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode != 0:
                return []

            items = json.loads(result.stdout)
            if not items:
                break

            for c in items:
                comments.append({
                    "id": c.get("id"),
                    "author": c.get("user", {}).get("login", "unknown"),
                    "body": c.get("body", ""),
                    "path": c.get("path", ""),
                    "line": c.get("line") or c.get("original_line"),
                    "side": c.get("side", ""),
                    "in_reply_to_id": c.get("in_reply_to_id"),
                    "created_at": c.get("created_at"),
                    "updated_at": c.get("updated_at"),
                })

            # --paginate handles all pages in one call
            break

        return comments

    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        return []


def fetch_diff(org: str, repo: str, pr_number: int) -> tuple[str | None, bool]:
    try:
        result = subprocess.run(
            ['gh', 'pr', 'diff', str(pr_number), '--repo', f'{org}/{repo}'],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            return None, False

        diff = result.stdout
        if len(diff) > MAX_DIFF_SIZE:
            truncated = diff[:MAX_DIFF_SIZE]
            last_file = truncated.rfind('\ndiff --git')
            if last_file > MAX_DIFF_SIZE // 2:
                truncated = truncated[:last_file]
            return truncated + "\n\n[... diff truncated, use `gh pr diff` for full content ...]", True

        return diff, False

    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None, False


if __name__ == "__main__":
    main()
