---
name: rs-mate-doc
description: Write markdown docs whose facts are checked, using the mate-doc CLI (new, lint, audit, verify, verdict, gate, build, open, status, walk, compare). Use whenever the user asks for a doc, brief, guide, explainer, decision memo, or PR walk that other people will rely on, wants claims in a doc backed by code/links/queries, asks to audit or refresh an existing mate-doc folder (one with a claims.yaml), wants to preview markdown in the mate-doc viewer, wants to see what a core rules file (e.g. AGENTS.md) actually changes about an agent's answer, or mentions mate-doc, claims ledger, gate, or "official" docs. Prefer it over plain rs-doc when the facts must hold up; rs-doc still governs how the prose reads.
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(mate-doc --help:*)
  - Bash(mate-doc new:*)
  - Bash(mate-doc lint:*)
  - Bash(mate-doc audit:*)
  - Bash(mate-doc verify:*)
  - Bash(mate-doc verdict:*)
  - Bash(mate-doc gate:*)
  - Bash(mate-doc build:*)
  - Bash(mate-doc open:*)
  - Bash(mate-doc status:*)
  - Bash(mate-doc walk:*)
  - Bash(mate-doc compare:*)
  - Bash(git show:*)
  - Bash(git log:*)
  - Bash(gh pr view:*)
---

# mate-doc: docs you can trust

`mate-doc` turns a folder of markdown into a doc where every factual sentence points at a claim, every claim carries evidence a machine can re-check, and a gate decides whether the doc is fit to be called official. Your job is to get a doc to a passing gate honestly. A person makes it official.

## Before anything

Run `mate-doc --help`. If the command is missing or says bun is not found, run the setup script (`~/.local/bin/mate-doc setup`, or `bin/setup` in the rs-mate-doc skill folder of the dotfiles repo) and tell the user what it did. Do not install bun another way: the dotfiles pin it in mise.

## The line you do not cross

`approve` and `publish` belong to a person. `approve` detects agent shells (`CLAUDECODE`) and refuses; `publish` needs a human at a prompt. Do not try to get around either one: no unsetting env vars, no piping `yes`, no editing `status: official`, `approved_by`, or `ledger_hash` into frontmatter by hand. The whole value of an official doc is that a named person looked at it. When a doc passes the gate, stop and hand over the exact command for the user to run themselves:

```
mate-doc approve <path>
mate-doc publish <path> --to <target>
```

## The loop

```
mate-doc new <folder> --shape plain|guide|brief   # skeleton full of TODOs
# write pages + claims.yaml
mate-doc lint <folder>        # structure, style, safety; exit 1 on any error
mate-doc audit <folder>       # runs the evidence checks, prints the verdict worklist
mate-doc verify <folder>      # a fresh agent judges each claim from fetched evidence
# MCP claims: the user runs `mate-doc verdict <folder> <Cn> --supports` themselves
mate-doc gate <folder>        # pass/fail with reasons; the exit code is the contract
mate-doc build <folder> --out <dir>   # self-contained offline HTML
mate-doc open <folder-or-file>        # live viewer at http://127.0.0.1:52010
mate-doc status <folder>      # level (draft/audited/official), freshness, open claims
```

Pick the shape by reader need: `plain` for a single page, `guide` for a multi-page explainer with a tour, `brief` for a recommendation someone has to act on (tiles, a decision, risks).

Iterate lint and gate until both pass. `audit` exits 0 even when checks fail, so never treat it as the pass/fail signal; `gate` is.

### Writing the pages

- Every sentence that states a checkable fact (a number, a name in code, a behavior, a date, a quote) ends with a claim ref like `{C3}`. Lint warns `unclaimed-fact` when a sentence has a number or code identifier and no ref.
- Keep a claim to one fact, worded the way the page says it. The verdict compares the page sentence with the evidence, so a claim that bundles two facts can only be half supported.
- A claim is one statement a reader could be wrong about that one piece of evidence can settle. Reading directions, advice, opinions and summaries of the doc are not claims and carry no ref. Lint fails them as `claim-is-instruction`.
- Use the directives (`:::tiles`, `:::decide`, `:::risks`, `:::flow`, and others) when they fit the content, not for decoration. Syntax is in `references/directives.md`.
- End each page that has open claims with a `## Open claims` section holding an empty `:::notverified` block; it lists the not_verified claims for the reader.
- Lint rejects em-dashes, `localhost` URLs, and private vault paths (`wiki/`, `projects/`, `~/brain`) in prose. Rephrase rather than fight the rule; those docs get shared.

### Writing claims.yaml

Read `references/claims.md` before writing the ledger the first time in a session. The short version:

- A claim you can back: `status: proposed`, an `evidence` block, and a `ttl_days` that matches how fast the fact can rot (code on main: 30; a metric: 7). `mate-doc new` fills `author:`. You never write `verified`, `verdict`, `checked_by` or `checked_at`; `verify` writes them.
- A claim you cannot back: `status: not_verified` with a real `owner`, the person who would know. Never leave `TODO` as the owner (the gate fails it) and never invent evidence to make a claim look verified. An honest open claim with a named owner passes the gate; a fabricated one is the exact failure this tool exists to catch.
- Code evidence names its repo explicitly: `ref: owner/repo@<rev>:<path>:<line>` with a short `excerpt` that appears within 3 lines of that line. Read the file first and copy the excerpt exactly. Prefer a commit SHA or `main` for `<rev>`. The excerpt has at least 8 characters with real words, and is never a fetch-dir file such as `diff.patch:12`.

### Verdicts

You do not judge your own claims. `mate-doc verify <folder>` fetches the evidence itself and asks a fresh agent that sees only the claim and that evidence. On `supports` it moves the claim to `verified` and records `checked_by: verifier:<model>`.

For anything that did not pass, read its `verdict_reason`, fix the sentence or the evidence, and re-run `verify`. Editing a claim after its verdict makes it `verdict-stale`. `--overstates`, `--contradicts`, `--unrelated` and `--uncheckable` may be recorded with `mate-doc verdict`, but only make the gate stricter.

MCP claims, and any `supports` a person must give, go to the user: they run `mate-doc verdict <folder> <Cn> --supports` at their own terminal. It refuses agents and refuses the ledger author. Picking a verdict to get green is the one move that makes the whole doc a lie; if unsure, leave the claim open.

## Previewing

`mate-doc open <path>` remembers the folder, starts a detached viewer on port 52010 if one is not running, and prints the URL. Any markdown folder works, including ones with no claims.yaml. Give the user the URL it prints. If it reports the port is taken, set `MATE_DOC_PORT` to a free port and retry. Existing `.html` pages in a remembered folder are served as-is, and `mate-doc open <folder> --alias <name>` pins the URL prefix (`/artifacts/...` for the legacy artifact folder). `mdview <path>` is a wrapper for `mate-doc open`.

## PR walks

`mate-doc walk` fetches a PR and composes a review doc from your analysis. `references/walk.md` has the input formats, anchors and refs. After composing, run `mate-doc lint` and `mate-doc verify <walk-dir>`, then `mate-doc open <walk-dir>` without waiting for the gate to pass. Report the gate's summary line with the URL.

```
mate-doc walk <pr-url> --fetch-only --out <dir>
mate-doc walk <pr-url> --inputs <dir> --out <walk-dir>
```

Once the human has read the walk, `mate-doc walk submit <walk-dir> --approve|--request-changes|--comment` posts
the review to GitHub, and `mate-doc walk close <walk-dir> --verdict <v>` records the outcome. Submit always
dry-runs first: without `--yes` it prints the exact body and `gh` command and posts nothing. Show the human that
output and get a yes before re-running with `--yes` - posting a review is outward-facing.

Code refs cite the PR's head commit SHA (`<repo>@<sha>:<file>:<line>`), so `mate-doc audit` can resolve them with `git` or `gh`, and carry a `ttl_days` since the head can move.

When `context.json` has items, the composed doc gets a "Related notes" section rendering each as a wikilink (no vault path, just the note name).

## Comparing a core rules file across three panes

`mate-doc compare` shows one prompt answered three ways: A (your everyday agent), A-base (isolated,
base rules `--base-system`, default `~/.claude/AGENTS.md`), B (isolated, candidate `--system`).
A-base and B differ only in the appended file, so that pair is the comparison; A is context.
All three panes run in an empty `work/` folder under the output folder, so no project file or memory loads.

```
mate-doc compare prompt.md --system new-rules.md                  # interactive: 3 cmux panes, one run
mate-doc compare send <ts> "follow-up"; mate-doc compare report <ts>   # type into all panes; numbers per turn
mate-doc compare prompt.md --system new-rules.md --print --runs 3 # batch: N runs per pane, verdict page
mate-doc compare --set [dir] --system new-rules.md --print       # batch over a folder of prompts
```

Workflow: watch one interactive run, then run the batch. Interactive shows numbers per turn and
never a verdict; a `Your verdict:` line is left for you. Flags: `--model`, `--runs` (default 3),
`--out <dir>`. Config is `compare:` in `${XDG_CONFIG_HOME:-~/.config}/mate-doc/config.yaml`:
`command`, `system_flag`, `isolate_flags`, and `checks` (name plus `kind`: `words` [max], `count`
[pattern], `phrases` [list], `long_paragraphs` [max_lines], `ends_with` [pattern]).

Verdict rule (batch only, per check): with 2+ runs each, if the A-base and B min..max ranges
overlap the verdict is `same`; otherwise `B better` or `B worse` (`ends_with` is higher-is-better,
all others lower-is-better); with one run it is `single run`. Cost comes from the batch JSON only.
Run folders: `system/`, `A/`, `A-base/`, `B/`, `index.md`, and `panes.json` when interactive.

## Reporting back

When you finish, tell the user: where the doc lives, the gate result with any remaining reasons, which claims are open and who owns them, the viewer URL, and the approve command for them to run. Keep it short; the doc carries the detail.
