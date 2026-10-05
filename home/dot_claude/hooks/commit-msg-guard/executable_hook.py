#!/usr/bin/env python3
"""commit-msg-guard — block agent commits with bloated messages.

PreToolUse hook on Bash. Reads the tool call JSON from stdin, pulls the
message out of `git commit -m ...` or a heredoc, and exits 2 (block, reason
fed back to the agent) when it breaks the house rules:

  - subject is `type(scope): subject`, <=72 chars
  - body is at most 2 lines (trailers like Co-Authored-By don't count)

Anything it can't parse (-F, -C, --no-edit, editor) passes through.
"""
import json
import re
import shlex
import sys

MAX_SUBJECT = 72
MAX_BODY_LINES = 2
TYPES = "feat|fix|refactor|docs|test|chore|style|perf|build|ci|revert"
SUBJECT_RE = re.compile(rf"^({TYPES})(\([\w./-]+\))?!?: \S")
TRAILER_RE = re.compile(r"^[A-Za-z-]+: .+|^[A-Za-z-]+ #\d+")
HEREDOC_RE = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?\n(.*?)\n\s*\1\b", re.S)


def extract_message(cmd):
    heredoc = HEREDOC_RE.search(cmd)
    if heredoc:
        return heredoc.group(2)
    try:
        tokens = shlex.split(cmd)
    except ValueError:
        return None
    parts, i = [], 0
    while i < len(tokens):
        tok = tokens[i]
        if tok in ("-m", "--message") and i + 1 < len(tokens):
            parts.append(tokens[i + 1])
            i += 2
            continue
        if tok.startswith("--message="):
            parts.append(tok.split("=", 1)[1])
        elif re.fullmatch(r"-[a-zA-Z]*m", tok) and i + 1 < len(tokens):
            parts.append(tokens[i + 1])  # e.g. -am "msg"
            i += 2
            continue
        i += 1
    return "\n\n".join(parts) if parts else None


def problems(msg):
    lines = [l.rstrip() for l in msg.strip().splitlines()]
    subject, rest = lines[0], lines[1:]
    body = [l for l in rest if l.strip() and not TRAILER_RE.match(l.strip())]
    found = []
    if not SUBJECT_RE.match(subject):
        found.append(f"subject must be `type(scope): subject` with type in {TYPES}")
    if len(subject) > MAX_SUBJECT:
        found.append(f"subject is {len(subject)} chars, max {MAX_SUBJECT}")
    if len(body) > MAX_BODY_LINES:
        found.append(f"body is {len(body)} lines, max {MAX_BODY_LINES}: say why, not what")
    if any(re.match(r"\s*([-*•]|\d+\.)\s", l) for l in body):
        found.append("no bullet lists in the body")
    return found


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return 0
    cmd = (data.get("tool_input") or {}).get("command", "")
    if not re.search(r"\bgit\b(\s+-\S+(\s+\S+)?)*\s+commit\b", cmd):
        return 0
    msg = extract_message(cmd)
    if not msg or not msg.strip():
        return 0
    found = problems(msg)
    if not found:
        return 0
    print(
        "Commit message rejected: " + "; ".join(found) + ".\n"
        "Rewrite it: `type(scope): subject`, then at most 2 lines of why. "
        "Details belong in the card, log, or PR description.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
