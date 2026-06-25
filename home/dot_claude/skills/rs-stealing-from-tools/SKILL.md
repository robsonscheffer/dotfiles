---
name: rs-stealing-from-tools
description: Use when the user points at a repository and asks what to steal, learn, or be inspired by for one of their own projects. Triggers on "comparison with X", "what can we steal", "what can we be inspired by", "what can we learn from", or pasting a repo URL with that intent.
argument-hint: "[repo URL or path] [optional: target project name]"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Agent
---

# rs-stealing-from-tools

The prompt looks like a brainstorm but is a **code audit**. Find load-bearing patterns the README does not advertise, name them with `path:line`, rank by leverage, leave a tracked artifact in the user's existing conventions.

**Core principle:** the leverage hides in `internal/`, `pkg/`, contract files (`*.yml`, `Makefile`), and disciplinary prose in skill files — not in the README. Treat the README as marketing.

## When NOT to use

- Literature surveys across many tools (use a research agent)
- The repo is the user's own project (use a review skill)
- Single-question lookups, not audits

## Detect conventions before writing anywhere

Infer where artifacts belong. Check in order:

1. **Workspace `CLAUDE.md` / `AGENTS.md`** for documented conventions (doc dirs, ticket layout, ID format).
2. **Visible hints** — a `tickets/`, `wiki/`, `docs/`, `projects/`, or notes-vault path.
3. **Ask once** if nothing detected. Cache the answer for the session.

Never assume a layout. Never invent paths.

## Procedure

1. **Clone and pin.** `git clone --depth 1 <url> <scratch>/<repo-slug>`; record URL + commit SHA (`git rev-parse HEAD`) + date. Every artifact carries these.
2. **Map the repo.** `tree -L 3 -I 'node_modules|.git|vendor|testdata'` + manifest (`go.mod`, `package.json`, `Cargo.toml`).
3. **Read internals, ≥5 source files.** Go: `internal/`, `pkg/`. TS: `src/`, `lib/`. Python: package dirs. Look for shared helpers, validation code, contract files shipped with the binary, state derivation.
4. **Cite `path:line` for every claim.** No claim survives without an evidence anchor.
5. **Verify suspicious claims.** Anything that "sounds like a pattern" — atomic writes, rule engines, plugin systems — `grep` + `Read` before quoting. Strike unverified claims explicitly.
6. **Surface ≥3 findings a human misses at first sight.** Load-bearing in code, invisible from the README.
7. **Rank by leverage, three tiers:** **do-now** / **next-cycle** / **when-pain-shows-up**. Flat lists are forbidden.
8. **Land artifacts in detected conventions.** A comparison/synthesis doc; a follow-up ticket if a tickets directory exists. Mark what you did NOT verify.

## Provenance block (top of every artifact)

```
source: <repo-url>
commit: <sha>
audited: <YYYY-MM-DD>
target: <user's project name or path>
verified: [list of claims with code evidence]
unverified: [list of claims marked but not confirmed]
```

## Data hygiene

- **Default to local.** Artifacts stay on disk. No paste-to-web, no upload-to-shared-doc, unless the user explicitly says so.
- **Public sources only by default.** If the audited repo is a private employer repo, ask before producing a sharable comparison — internal code in a comparison doc has different governance.
- **No identifying details from the user's environment** in artifact filenames or content beyond what's necessary for the user's own retrieval.

## Anti-patterns

| Failure mode | Counter |
|---|---|
| README + docs only, no source | Steps 1, 3, 4 are not optional. README is marketing. |
| "Brainstorm prompt" framing | "What can we steal" IS an audit prompt. |
| Feature-parity table with no citations | Every cell needs `path:line`. |
| Vague recs ("good lock gate") | Name file, line, and smallest concrete port. |
| Flat list of 10 ideas | Three tiers with cost/leverage reasoning. |
| Chat-only output | Step 9 is the close. Without it, the work scrolls away. |
| Trusting a sub-agent's claim without grep | Hallucination is the default for non-cited claims. |
| "I'll go deeper if asked" | Pushback should not be the trigger. Go deep first. |
| Hardcoding artifact paths | Detect conventions; ask if absent. Do not assume. |

## Red flags — STOP and restart at step 1

- About to answer without `git clone` having run this session
- About to cite "the X logic" without a `path:line`
- About to enumerate without tiering
- About to write to a path you guessed instead of detected
- About to send the reply without provenance-stamped artifacts on disk

## Output shape

End-of-turn message: (1) one-paragraph headline finding, (2) tiered port plan with one-line what/why/cost per item, (3) paths to the artifacts. The artifacts are the work; the chat is the index.
