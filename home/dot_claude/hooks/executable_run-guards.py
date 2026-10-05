#!/usr/bin/env python3
"""run-guards: run the blocking Bash guards for harnesses without Claude-style hooks.

opencode and pi call this before every shell command. Input on stdin is the Claude
PreToolUse shape, {"tool_input": {"command": ...}, "cwd": ...}. Each guard gets the same
input; the first that exits 2 wins, and its reason goes to stderr with exit 2.
"""
import os
import subprocess
import sys

HOOKS = os.path.dirname(os.path.abspath(__file__))
GUARDS = ["commit-msg-guard/hook.py", "push-guard/hook.py"]


def main():
    data = sys.stdin.read()
    for guard in GUARDS:
        result = subprocess.run(
            [sys.executable, os.path.join(HOOKS, guard)],
            input=data, capture_output=True, text=True,
        )
        if result.returncode == 2:
            sys.stderr.write(result.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
