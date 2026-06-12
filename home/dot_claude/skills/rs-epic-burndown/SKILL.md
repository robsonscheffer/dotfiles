---
name: rs-epic-burndown
description: Use when scaffolding or tracking a multi-phase software epic with mate-style tickets and an HTML burndown dashboard. Triggers on "epic burndown", "scaffold epic", "track epic progress", "sync burndown dashboard", or when a user has a locked design spec and wants to split it into mate tickets with a visible burndown.
---

# Epic Burndown

End-to-end workflow for taking a locked design spec and turning it into a mate-style epic: epic doc, phased ticket folders, and a self-contained HTML burndown dashboard that mirrors current ticket state.

Cross-references:

- **REQUIRED SUB-SKILL:** Use `html-artifact` for the dashboard HTML primitives + mate design tokens.
- Related: `create-mate-ticket` for single-ticket creation (this skill orchestrates many).

## When to use

- A design spec is locked and the work is large enough to need phases (groundwork / structural / surfaces / polish).
- The repo is the home of the work (repo-local epic) — not for cross-repo coordination.
- The user wants to track progress visually rather than re-reading frontmatter.

Don't use when:

- The work is a single ticket — just use `create-mate-ticket`.
- The epic is brain-only (no code repo) — use `mate brain` workflows.
- There's no spec yet — brainstorm first.

## Modes

Parse mode from arguments. Default is `new` if a spec path is provided.

| Mode    | Trigger                    | Action                                                          |
| ------- | -------------------------- | --------------------------------------------------------------- |
| `new`   | `new <spec-path> <prefix>` | Full scaffold: epic doc + ticket folders + dashboard            |
| `sync`  | `sync <prefix>`            | Re-read all ticket frontmatter, rebuild dashboard counts + rows |
| `add`   | `add <prefix>-NNN <slug>`  | Append a new ticket to an existing epic                         |
| `close` | `close <prefix>`           | Move epic to `done/`, archive tickets, mark dashboard complete  |

## Conventions (mate ticket contract)

These are non-negotiable — mate's `mate ticket lint` enforces them.

| Where           | Path                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| Epic doc        | `<repo>/docs/epics/<epic-slug>.md` (flat md, not a ticket folder)             |
| Tickets         | `<repo>/docs/plans/active/<PREFIX>-NNN-<slug>/README.md`                      |
| Done tickets    | `<repo>/docs/plans/done/<PREFIX>-NNN-<slug>/README.md` (moved on status=done) |
| Dashboard       | `~/brain/wiki/artifact/dashboard/<YYYY-MM-DD>-<epic-slug>-epic.html`          |
| Ticket contract | `<repo>/docs/plans/.ticket-contract.yaml` (copy from usemate if missing)      |

ID format: `^[A-Z]+-[0-9]+(-[a-z][a-z0-9-]*)?$`. Pick a prefix that won't collide with existing tickets in the repo (e.g. `CANVAS` for mate-vscode rebuild, since mate-vscode is separate from `usemate`'s `MATE-NNN` numbering).

Required ticket frontmatter: `id`, `status`, `needs`, `created`, `updated`. Optional but used here: `epic`, `depends`, `tags`. See the canonical contract at `~/apps/robsonscheffer/usemate/docs/plans/.ticket-contract.yaml`.

Legal `(status, needs)` pairs only — anything else fails lint. Common pairs for new tickets: `(open, spec)` for stubs, `(open, plan)` for fully-spec'd tickets ready to plan, `(building, verify)` mid-build.

## `new` mode — full scaffold

1. **Read the spec.** Identify phase breakdown. If the spec doesn't have phases, propose them (e.g. groundwork / structural / surfaces / polish) and confirm with user before scaffolding.
2. **Pick prefix + numbering.** `<PREFIX>-001` through `<PREFIX>-NNN`. Reserve room for additions (don't start at 1 if the prefix is shared with other tickets).
3. **Create the epic doc** at `<repo>/docs/epics/<epic-slug>.md`. Template:

   ```markdown
   # Epic: <name> — <one-line tagline>

   ## What

   <2–3 sentences describing the work>

   ## Why

   <link to spec + 2–3 sentences on why this rebuild now>

   ## Scope

   <bullet list of files / surfaces touched>

   ## Phase N · <name>

   | Ticket       | Title   |
   | ------------ | ------- |
   | <PREFIX>-NNN | <title> |

   ## Architecture decisions

   <bullet list — the locked design decisions from the spec>

   ## Invariants

   - No Phase N+1 ticket starts before Phase N is `done`.
   - <other constraints>
   ```

4. **Create one ticket folder per work item.** Each folder gets a `README.md` with frontmatter + `## What` + `## Why` + `## Log`. Default to `status: open, needs: spec` for stubs; `status: open, needs: plan` if you wrote full ACs.
   - Dependencies: use the `depends:` frontmatter to link tickets. Phase N+1 tickets should depend on at least one Phase N ticket so the planner sequences correctly.
   - The first ticket in Phase 0 (the spike or foundation) should be fully spec'd — it's the kickoff.
5. **Generate the dashboard.** Use `html-artifact` skill's dashboard template at `~/brain/wiki/artifact/dashboard/<date>-<epic-slug>-epic.html`. Sections:
   - 5-stat header: Total, Done, Building, Open, Progress %
   - Per-phase cards with progress bars (one card per phase)
   - One table per phase, columns: ID, Title, Status badge, Needs, Depends (Phase 0/1) or Audit ref / Spec section / Tag (later phases)
   - **Every ticket-ID cell wraps the ID in `<a href="/md?path=<abs-path>">…</a>`** — the path is the absolute README.md path (active or done). The `/md` route renders the markdown live with mate theme + frontmatter rail.
   - **Epic-doc link in the meta line:** `<a href="/md?path=<abs-path-to-epic.md>">epic: docs/epics/<name>.md</a>`.
   - "How to update" footer with the sync command.

   The `md_roots` field in `~/.config/html-artifact.json` must include the repo root or a parent dir of the ticket paths, otherwise the `/md` route returns 403.

6. **Register the dashboard** in `~/brain/wiki/artifact/index.html`'s `ARTIFACTS` array.
7. **Commit each piece separately** so git history is greppable: `tickets: scaffold <prefix> epic + phase 0 stubs`, `chore: add <prefix> burndown dashboard artifact`.
8. **Lint:** run `node ~/.claude/skills/html-artifact/bin/lint-artifact.mjs <dashboard-path>` and fix violations.

## `sync` mode — rebuild dashboard

Run the `burndown-sync` CLI (ships with the `html-artifact` skill):

```sh
burndown-sync \
  --repo <repo-root> \
  --prefix <PREFIX> \
  --epic <repo-root>/docs/epics/<slug>.md \
  --out ~/brain/wiki/artifact/dashboard/<YYYY-MM-DD>-<slug>-epic.html
```

What it does:

1. Scans `<repo>/docs/plans/{active,done}/<PREFIX>-*/README.md` for tickets.
2. Parses frontmatter via `gray-matter`.
3. Buckets tickets by phase via `tags:` (looks for `phase-N` tag).
4. Reads phase titles from epic md `## Phase N · <title>` headings.
5. Re-renders the dashboard from `dist/templates/burndown.html`, replacing the previous file in place. Manual edits to the dashboard HTML are blown away by intent — the dashboard is a derived artifact.
6. Lint with `node ~/.claude/skills/html-artifact/bin/lint-artifact.mjs <out>`.
7. Commit: `chore: sync <prefix> burndown dashboard`.

Status badge mapping:
| Status | Badge class |
| --- | --- |
| `open` | `badge-soft badge-open` |
| `ready` | `badge-soft badge-ready` |
| `building` | `badge-soft badge-building` |
| `done` | `badge-soft badge-done` |
| `dropped` | `badge-soft badge-dropped` |

## `add` mode — append a ticket

1. Pick the next free number in the prefix sequence.
2. Create the ticket folder + README with frontmatter referencing the epic.
3. Update the epic doc's phase table.
4. Run `sync`.

## `close` mode — finish the epic

1. Verify every ticket is `status: done` (lint will catch otherwise).
2. Move epic md from `docs/epics/<name>.md` to `docs/epics/done/<name>.md`.
3. Move ticket folders from `docs/plans/active/<PREFIX>-*` to `docs/plans/done/<PREFIX>-*`.
4. Update dashboard header badge to `done`, set Progress to 100%, add a closing date in the meta line.
5. Commit: `chore: close <prefix> epic — all phases done`.

## Common mistakes

- **Creating the epic as a ticket folder** (`<PREFIX>-000-epic/README.md`). Wrong — epics are flat md files in `docs/epics/`. The contract distinguishes between tickets (folders with READMEs and legal state machines) and epics (free-form md docs).
- **Re-using `MATE-NNN` numbering for mate-vscode tickets.** mate-vscode is a separate repo from `usemate`; use a distinct prefix to avoid collisions.
- **Writing all ticket ACs upfront.** Phase 1/2/3 stubs should be terse (`status: open, needs: spec`). Flesh out when their dependencies near `done`. Stale 30-ticket backlogs become noise.
- **Forgetting to commit the ticket file before dispatching the craft pipeline.** mate's builder aborts on a dirty tree — create file, commit, then dispatch.
- **Saying "mate-next".** mate-next is merged into mate; the craft pipeline is just `mate` now.
- **Skipping lint on the dashboard.** `html-artifact` enforces font-size, hex-color, and token rules. Always lint before commit.

## Quick reference — file commands

```sh
# scaffold (after reading the spec)
mkdir -p <repo>/docs/epics
mkdir -p <repo>/docs/plans/active/<PREFIX>-001-<slug>

# sync — list current ticket states for a prefix
grep -h "^status:\|^needs:\|^id:" <repo>/docs/plans/active/<PREFIX>-*/README.md

# lint the dashboard
node ~/.claude/skills/html-artifact/bin/lint-artifact.mjs <dashboard-path>

# view dashboard live (artifact-serve runs persistent on :52010)
open http://localhost:52010/artifacts/dashboard/<filename>.html

# view a single ticket md rendered live in browser
mdview <repo>/docs/plans/active/<PREFIX>-NNN-<slug>/README.md
# or get the URL only
mdview --url <path-to-md>
```
