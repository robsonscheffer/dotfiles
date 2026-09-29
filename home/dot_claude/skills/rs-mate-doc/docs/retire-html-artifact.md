---
title: Post-merge checklist - retire html-artifact
type: how-to
summary: One-time steps to run on the live machine after the html-artifact-retirement PR merges. Not run by this PR; run by hand, in order.
---

This PR removes the `html-artifact` skill from the dotfiles repo and moves everything that used
it onto `mate-doc` (the `rs-mate-doc` skill). The dotfiles change itself is safe to merge without
touching the live machine; the old LaunchAgent keeps serving on its old port until you run
these steps. Do them in order, on the machine, after the PR is on `main`.

`<brain>` below is a placeholder for your vault path, substitute your own.

## 1. Unload and remove the old LaunchAgent

```sh
launchctl bootout gui/$(id -u)/com.robsonscheffer.html-artifact
rm -f ~/Library/LaunchAgents/com.robsonscheffer.html-artifact.plist
```

**Verify:** `launchctl print gui/$(id -u)/com.robsonscheffer.html-artifact` exits non-zero
("could not find service") and `lsof -i :52010` prints nothing.

## 2. Pull the merged dotfiles change onto the machine

```sh
chezmoi apply
```

`chezmoi apply` does not delete files that disappeared from the source on its own; the
`.chezmoiremove` entry for `.claude/skills/html-artifact` is what removes the live copy.

**Verify:** `test -d ~/.claude/skills/html-artifact && echo "still present" || echo "gone"`
prints `gone`; `test -x ~/.claude/skills/rs-mate-doc/bin/mate-doc && echo ok`.

## 3. Set up mate-doc

```sh
~/.claude/skills/rs-mate-doc/bin/setup
```

The viewer's default port is now 52010, the one html-artifact freed in step 1. If you exported
`MATE_DOC_PORT` (for example 52012 while both viewers ran side by side), unset it, and change
`port:` in `~/.config/mate-doc/config.yaml` to 52010; setup never overwrites that file.

**Verify:** the command prints `setup: done` with no errors; `command -v mate-doc` and
`command -v burndown-sync` and `command -v mdview` all resolve (open a new shell first if
`~/.local/bin` was just added to `PATH`).

## 4. Stop any running viewer before pointing it at a folder

```sh
mate-doc stop 2>/dev/null || true
```

If `mate-doc stop` doesn't exist yet, stop it by hand instead: read the pid from
`~/.local/state/mate-doc/server.pid` and `kill` it, then remove that file.

**Verify:** `lsof -i :52010` prints nothing, confirming the port is free before step 5 starts
a viewer on it.

## 5. Point the viewer at your existing artifact folder, keeping the old URLs alive

```sh
mate-doc open <brain>/wiki/artifact --alias artifacts
```

**Verify:** `curl -sI http://localhost:52010/artifacts/index.html | head -1` (or any known
`.html` page under that folder) returns `200`. Existing bookmarks and skill instructions that
say `http://localhost:52010/artifacts/...` keep resolving.

## 6. Remove the old config file

```sh
rm -f ~/.config/html-artifact.json
```

**Verify:** `test -f ~/.config/html-artifact.json && echo "still there" || echo "gone"` prints
`gone`. mate-doc's own config lives separately at `~/.config/mate-doc/config.yaml` (written by
step 3) and is untouched by this.

## After all six

Confirm the viewer survives a reboot by checking it comes back up the next time something calls
`mate-doc open`. It spawns detached and writes a pid file under
`~/.local/state/mate-doc/server.pid`. There's no LaunchAgent for it, by design: `mate-doc open`
self-starts the viewer on demand.

## Migrate legacy pages, then drop the legacy CSS

The viewer carried a compatibility layer for pages written by the tool it replaced: an old
stylesheet URL, and an old query-string link format.

1. **Done.** The old `/md?path=<absolute path>` link format has been removed; all pages that
   used it were migrated first. A request to `/md?path=...` now 404s like any other unknown
   route.
2. The old stylesheet route (`/style/main.css`) stays for now, on purpose; some pages still
   link it. List remaining pages with `rg -l 'localhost:52010/style/main.css' <artifact dir>`,
   migrate them, then delete the legacy assets directory, the route, and its tests.
