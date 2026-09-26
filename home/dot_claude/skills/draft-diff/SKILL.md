---
name: draft-diff
description: 'Use when iterating on any written artifact (a spec, a PR description, a skill, a ticket, prose) across multiple revisions — show the delta as a visual diff artifact instead of re-pasting the full text in chat, and optionally get an independent blind redraft from an isolated subagent as a second opinion. Triggers on "iterate on this", "show me just the diff", "get a second opinion on this draft", "redraft this blind", or a user asking not to see the full text again after the first version.'
argument-hint: "[file-being-drafted] [blind-redraft]"
allowed-tools: Read, Grep, Glob
---

# Draft Diff

A technique, not a content skill: once a draft exists, every later revision is shown as a
diff against the last version, never as another full wall of text. Any content-writing skill
(PR descriptions, tickets, specs) should call this rather than re-implementing it.

## Arguments

```
$ARGUMENTS
```

Bare invocation means diff the current draft against its last saved version. `blind-redraft`
means also get an independent second draft first (below), then diff that against the current
one.

## Versioning convention

Save every revision of the artifact under `~/brain/.scratch/artifact/report/<slug>-v<N>.md`,
starting at `v1` for whatever the first real version is (an existing live doc, or the first
draft if there's no prior state). Never overwrite a version in place — a new revision is
always a new `vN` file, so the diff has two real endpoints to compare.

## Rendering the diff

```sh
python3 ~/.claude/skills/draft-diff/scripts/render-md-diff.py \
  <prev-version.md> <new-version.md> "<title>" \
  ~/brain/.scratch/artifact/report/<slug>-diff.html <port>
```

Left pane is a unified diff (added/removed/context, mate-DS styled). Right pane is the new
version rendered in full via `marked.js` from a CDN, so the whole current state is readable,
not just the delta. `<port>` comes from `~/.config/mate-doc/config.yaml` (default `52010`).

Then, every time, before opening:

1. If the draft itself is markdown, lint it first: `mate-doc lint <prev-version.md|new-version.md>`
   must pass clean; fix violations in the draft, not in the diff artifact.
2. The diff artifact is plain HTML (not a mate-doc doc), so it isn't linted or served through
   `mate-doc open`; it's a self-contained file, opened directly: `open <diff-path>`.
   It still links to `http://localhost:<port>/style/main.css` for the mate-DS stylesheet,
   which mate-doc's viewer serves regardless of alias, so start it once if it isn't already
   running: `mate-doc open ~/brain` (or any remembered folder) brings the viewer up detached.
3. Open: `open ~/brain/.scratch/artifact/report/<slug>-diff.html`.

**Once a diff artifact exists for a revision, never also paste the full draft in chat.**
Point at the URL and summarize only what changed, in a sentence or two.

## Blind redraft (second opinion)

When the user wants an independent check on a draft, not just a revision of it: dispatch a
**fresh** subagent (not a fork — it must not inherit your context or your draft) with only
the source facts the draft is built from (the diff, the ticket, the repo state — whatever
grounds it), instructed to produce its own version from scratch and write it to a new `vN`
file. Explicitly tell it:

- Not to read or be shown any prior draft as a baseline.
- Not to take any live/write action (no pushing, no editing a real ticket or PR) — this is a
  dry run that only writes to its own output file.
- To verify facts itself (run the tests it cites, read the diff itself) rather than trusting
  a summary handed to it.
- To report back a short summary only — the file is what gets read, not a chat wall.

**Run the blind redraft through `Skill(rs-voice)` before diffing it against anything.** An
isolated subagent has none of the session's accumulated voice corrections — it writes
technically sound, generically-toned prose by default, which reads as a regression next to a
draft that's already been through voice passes, even when its facts are better. Voice-fix it
first, so the diff you show compares content quality, not "isolated agent forgot the voice
rules."

Then render the diff between the current draft and the blind redraft, same as above. Two
independent drafts disagreeing on facts is itself a signal — surface it, don't silently pick
one. A voice regression is not that signal; fix it before comparing.

## Examples

```
/draft-diff                          → diff current draft against its last saved version
/draft-diff blind-redraft            → get an independent redraft, then diff against it
```
