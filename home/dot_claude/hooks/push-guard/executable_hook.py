#!/usr/bin/env python3
"""push-guard: block the git pushes that stay off-limits once push is allowed.

Blocks (exit 2): a force push without --force-with-lease (--force, -f, +refspec),
and any push to main or master, named or implied by the current branch.
Everything else passes through to the normal permission rules.
"""
import json
import re
import shlex
import subprocess
import sys

PROTECTED = {"main", "master"}


def block(reason):
    print(f"push-guard: {reason}", file=sys.stderr)
    sys.exit(2)


def current_branch(cwd):
    try:
        out = subprocess.run(
            ["git", "-C", cwd or ".", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=5,
        )
        return out.stdout.strip()
    except Exception:
        return ""


def check_push(args, cwd):
    positional = []
    for a in args:
        if a in ("--force", "-f") or (re.fullmatch(r"-[a-zA-Z]*f[a-zA-Z]*", a) and not a.startswith("--")):
            block("plain force push is not allowed; use --force-with-lease")
        if a.startswith("-"):
            continue
        positional.append(a)

    refspecs = positional[1:]  # first positional is the remote
    for spec in refspecs:
        if spec.startswith("+"):
            block(f"'{spec}' is a force push; use --force-with-lease")
        dst = spec.split(":")[-1].removeprefix("refs/heads/")
        src = spec.split(":")[0]
        if dst in PROTECTED or (dst == "HEAD" and current_branch(cwd) in PROTECTED):
            block(f"push to {dst} is not allowed; open a PR instead")
        if ":" not in spec and src == "HEAD" and current_branch(cwd) in PROTECTED:
            block("push from main/master is not allowed; open a PR instead")

    if not refspecs and current_branch(cwd) in PROTECTED:
        block("push while on main/master is not allowed; open a PR instead")


def main():
    data = json.load(sys.stdin)
    command = data.get("tool_input", {}).get("command", "")
    if "push" not in command:
        return
    cwd = data.get("cwd", ".")
    # Split chained commands and inspect each git push on its own.
    for part in re.split(r"&&|\|\||;|\|", command):
        try:
            tokens = shlex.split(part)
        except ValueError:
            continue
        while tokens and re.fullmatch(r"\w+=.*", tokens[0]):
            tokens.pop(0)
        if len(tokens) < 2 or tokens[0] != "git":
            continue
        # Skip git global options such as -C <dir>.
        i = 1
        while i < len(tokens) and tokens[i].startswith("-"):
            if tokens[i] == "-C" and i + 1 < len(tokens):
                cwd = tokens[i + 1]
                i += 2
            else:
                i += 1
        if i < len(tokens) and tokens[i] == "push":
            check_push(tokens[i + 1:], cwd)


if __name__ == "__main__":
    main()
