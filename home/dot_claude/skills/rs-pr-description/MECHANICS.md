# Mechanics

Read when reading the change, finding the template, or landing the body. Content rules live
in `SKILL.md`. This file is `git`, `gh`, and hook behavior only.

## Reading the change

```sh
gh pr diff <number> --repo <org>/<repo>     # open PR
git diff origin/main...HEAD                 # branch, no PR yet
git log origin/main..HEAD --oneline         # commit subjects, often carry the ticket ID
```

A ticket ID usually sits in the branch name or a commit subject. Pull it from there. Never
prompt for one; a change with no findable ticket gets described from the diff alone.

## Finding the template

```sh
find <repo-root> -maxdepth 2 \
  \( -iname "PULL_REQUEST_TEMPLATE.md" -o -ipath "*/.github/PULL_REQUEST_TEMPLATE.md" \)
```

Run it every time, per repo. Templates differ and the hook below re-checks on every write
regardless of what happened in a previous session.

## The enforcement hook

Repos can enforce their template with a PreToolUse hook (`enforce-pr-template.rb`, from the
`eng-workflow` plugin). It blocks `gh pr create` and `gh pr edit --body` when the body is
missing any of the template's `##`-level headings as a literal substring. Match them exactly:
same words, same casing, same question marks.

## The quoting footgun

The hook pulls the body out of the raw shell command with a naive quote-matching regex. One
literal `"` in the body, and inline code often has one (`heightBasis="breakpoint"`), closes
the match early and truncates the rest. The hook then reports most sections missing against a
draft that is completely correct.

Hard rule: write the body to a file and pass `--body-file`. Never inline `--body "<text>"`.

```sh
gh pr create --repo <org>/<repo> --title "<title>" --body-file <path>
gh pr edit <number> --repo <org>/<repo> --body-file <path>
```

## Merge-queue check

Before editing an already-open PR:

```sh
gh pr view <number> --repo <org>/<repo> --json mergeStateStatus
```

An edit or push silently kicks a queued PR out of the queue and it has to be resubmitted. If
it is queued, stop and say so. Do not edit.

## Approval

`gh pr create` and `gh pr edit` are deliberately outside `allowed-tools`. They publish. Every
write to a real PR prompts, every time. That is the design, not friction to route around.
