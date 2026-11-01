---
name: rs-content-intake
description: Collect last week's work, notes and voice ideas into a short week entry for an Instagram content plan, filter it with a block and an allow list, and post it as a week page under the account's changelog index on the Wiki only after a person keeps it. Use when Robson asks for the weekly material, content intake, "o que rendeu post esta semana", or when the Saturday intake runs.
argument-hint: "[days] [send]"
---

# rs-content-intake

Turns a week of real work into post material, so the content plan does not wait for a person to
remember what happened. Two steps, and a person sits between them:

1. **Draft** (local only): collect, group by topic, pick the best, write a Markdown draft in
   `~/brain/.scratch/`. Nothing leaves the Mac.
2. **Send** (only after a person says so): post the kept entry as a week page under the
   changelog index the weekly plan reads.

Related: `rs-session-audit` reads the same week of Claude Code sessions to find skill gaps; this
skill reads what those sessions produced (session reports, reports, handoffs, commits). Run the
audit first when both run on the same day, and drop any item it flags as tooling friction.

## Step 1: draft

1. Run `bash scripts/collect.sh --days ${1:-7} > <scratch>/items.jsonl`. It reads the sources in
   `references/sources.md` and applies the lists in `references/privacy.md`. Read its stderr line:
   it says how many items the block list dropped.
2. Read the items. Group them by topic (a project or a theme a reader would recognise), not by
   source. Several commits and a session about the same thing are one item.
3. For each item write: what happened in one line, the proof (a link, a number, a screenshot path),
   a suggested pillar from the brand data skill, and a verdict:
   - **destaque**: the 3 to 5 best. A real number, a visible result, a mistake with a lesson, or a
     question people ask.
   - **manter**: usable later.
   - **descartar**: nothing to show, internal only, or repeats a destaque. Left out of the entry.
4. `class: review` items are titles only. Never add detail to them from the source files; a person
   decides first. `class: allow` items may carry their detail.
5. Write the entry in the shape and limits of `references/wiki-output.md` to
   `~/brain/.scratch/YYYY-MM-DD-changelog-semana-<n>.md` and open it for the person.
6. Stop. Report the counts (items in, blocked, destaques) and the file path.

## Step 2: send

Only when the person says send, and after they edited the draft:

1. Re-read the draft from disk. The person's edits win.
2. Check it again against the block list: `bash scripts/send.sh --check <draft>` exits 3 when a
   blocked word is in it. Remove the line and tell the person.
3. `bash scripts/send.sh <draft>` creates the week page and lists it first on the index. It
   refuses if that week's page exists. It needs `OUTLINE_API_URL`, `OUTLINE_API_KEY` and
   `INTAKE_PAGE` (the changelog page id) in the environment. Never print the key.
4. Give the person the page link.

## Voice ideas

How to capture an idea by voice and how the notes are read: `references/voice-notes.md`.

## Rules

- The draft is private until sent. Never paste review items into a chat, an issue or a commit.
- A person approves the weekly plan and each post. This skill only proposes material.
- Missing source (no OpenWhispr, no sessions file): skip it and say so in the report.
