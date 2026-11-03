---
name: rs-pr-description
description: Use when drafting or revising a GitHub pull request title or description against a repo's own PR template. A new PR, updating an open one, or re-doing a body a PR-template hook rejected. Triggers on "write a PR description", "update the PR body", "the PR template hook rejected this", "describe this PR", "title for this PR", or a github.com/.../pull/NNN URL with a request to draft or fix it. For a changelog block that a repo's tooling parses, use that repo's own skill instead.
argument-hint: "[PR number | PR url | branch] [new | revise]"
model: opus
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(gh pr view:*)
  - Bash(gh pr diff:*)
  - Bash(git diff:*)
  - Bash(git log:*)
---

# PR Description

Get a competent reviewer to a confident yes, fast. Describe the change, not the work that produced it.

## Arguments

```
$ARGUMENTS
```

A number or URL revises that live body. A branch with an open PR revises it too. Otherwise
(branch with no PR, bare `new`, no argument) draft fresh against `origin/main...HEAD`.

## Instructions

**1. Two kinds of fact, two sources.** What the change _is_: the diff, the full commit bodies (`git log
--format='%s%n%b'`, never headlines alone), the ticket if there is one. What was _verified_: only this
session's evidence. Never source the change from the build conversation, never invent a verification.

**2. Author in the canonical shape, then map.** Six slots: **What**, **Why**, **Where to look**,
**Testing**, **Risk**, **Links**. Where-to-look opens only on a large or uneven diff: name the parts
that are mechanical so a reviewer can skim them, then the one or two spots that need real attention and
why. Risk opens only for flag state, deploy order, or an absence that reads as an oversight. Write the
slots, then render them into the repo's headings verbatim, keeping every heading even when the answer
is `N/A`. Finding the template and why exact headings matter: `MECHANICS.md`. Worked mapping: `GOLDEN.md`.

**3. Title: `[TICKET-ID] <imperative sentence>`, under 70 characters including the prefix.** Name what becomes true, not how.

**4. What: situation, verdict, consequence.** Name the stale situation and the specific thing wrong with
it. One short sentence on what this PR does about it, alone on its line. Then the observable consequence
for whoever is affected: the screen on a UI change, the next engineer on groundwork. Mechanism only when
a reviewer needs it to find the file.

**5. Why: one decision, not a list.** The single choice a reviewer would argue with. First person, the
alternative named, the consequence stated: "I translate at the `useInvoiceRows` boundary rather than
changing the four functions below it, so this stays a swap instead of a data-path refactor."

**6. Testing: tests are assumed.** What changed about the test surface and why, what covers the new
behaviour, then the gap and where it got covered instead. Never an inventory, never "all specs pass".
Tick a checklist box only from session evidence; leave screenshots you cannot produce as an empty row.

**7. Built for a human scan, with a hard word cap.** A reviewer reads the first line of each section
and skims the rest. So each section opens with its point, paragraphs stay at three lines or fewer, and
three or more parallel items become bullets. Caps, sized to the diff and not the effort spent: 40 words
for a trivial change, 200 standard, 350 large. The cap is a limit, not a target. Over it, cut sentences;
do not compress them. Earn test on every sentence: does a reviewer with the diff open lose something
they cannot recover from it, the commits, or the ticket? Always keep a sentence saying why something is
absent.

**8. AI agent notes go in a collapsed section, last.** Context that helps an AI reviewer or a follow-up
agent but slows a human goes in one `<details>` block after every template heading:

```markdown
<details>
<summary>Notes for AI agents</summary>

- ...

</details>
```

Bullets only, 150 words at most, not counted in the cap above. It holds facts an agent would otherwise
re-derive: invariants the change relies on, code left alone on purpose and why, the command that
verifies it. Same sourcing as step 1: nothing about how the work went, no invented verification. Nothing
a human reviewer needs goes only here. Omit the block when it would be empty.

**9. Voice: plain, short, honest.** Many reviewers read English as a second language. Write so they
read each sentence the same way on the first pass.

- Short declarative sentences. Periods over commas where they fit. First person "I" for choices.
- Name the actor. Put the words that carry the meaning first on every line.
- Concrete over abstract: the file, the function, the command. Name a tool by what it does on first
  use, so a reader who has not met it learns it in one line.
- Plain words over jargon or literary words. No metaphors a reader has to decode.
- Hedge only where you are uncertain, and say what is uncertain. Name a gap or a failure directly.
- Long explanation, then a short verdict. No "not X, it's Y".
- No em-dashes. Use a comma, period, colon, or parentheses.
- Banned: delve, dive in, journey, leverage, robust, seamless, really, very, truly, simply, just
  (as filler), However, Furthermore, Moreover, In conclusion, arguably, "it might be the case that".
- Code, commands, and quoted text stay verbatim. These rules apply to prose.

**10. Gate, then land.** Reread as a reviewer who sees only the title and first three lines. Count the
words outside the `<details>` block against the cap. Scan for em-dashes, the banned words, unearned
checkboxes, and any "Generated with Claude Code" footer, which never belongs in a body the user ships.
Write with `--body-file`, never inline `--body`. On a revision, show only what changed, not the full
body again.

## Examples

```
/rs-pr-description 39821       → revise the live body on PR #39821
/rs-pr-description new         → draft for a PR not yet opened
/rs-pr-description revise      → keep iterating on the current draft
```
