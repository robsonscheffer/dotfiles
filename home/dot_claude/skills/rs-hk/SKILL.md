---
name: hk
description: "Use when bootstrapping hk pre-commit hooks for a project."
argument-hint: "[stacks... | --check | --update]"
disable-model-invocation: true
allowed-tools:
  - Glob
  - Grep
  - Read
  - Bash(command -v:*)
  - Bash(git log --oneline:*)
  - Bash(git rev-parse:*)
  - Bash(hk --version:*)
  - Bash(hk check:*)
  - Bash(hk validate:*)
  - Bash(mise --version:*)
  - Bash(mise ls-remote:*)
  - Bash(mise registry:*)
  - Bash(mise which:*)
  - Bash(test -d:*)
  - Bash(test -f:*)
  # NOTE: mise use, hk install, hk fix, Write, Edit require user approval (intentional)
---

# hk — Pre-commit Hook Bootstrap

## Arguments

```
$ARGUMENTS
```

## Pre-computed Context

```
Git repo root: !`git rev-parse --show-toplevel 2>/dev/null || echo "NOT A GIT REPO"`
hk.pkl exists: !`test -f hk.pkl && echo "yes" || echo "no"`
hk available: !`command -v hk 2>/dev/null && hk --version 2>/dev/null || echo "not installed"`
mise available: !`command -v mise 2>/dev/null && mise --version 2>/dev/null || echo "not installed"`
Conventional commits: !`git log --oneline -10 2>/dev/null || echo "no git history"`
```

## Constraints

- **Always call `EnterPlanMode` before making any changes.** Plan-first — detection and analysis happen before any writes.
- Never use `git -C <path>` — breaks `allowed-tools` pattern matching.
- Always use `--mise` flags: `hk init --mise` and `hk install --mise` so hooks execute via `mise x` (tools auto in PATH).

## Instructions

### Parse Arguments

| Pattern | Mode |
|---------|------|
| (empty) | **Auto-detect**: scan project, detect stacks, full bootstrap |
| `--check` | **Check**: validate existing `hk.pkl`, run `hk check --all` |
| `--update` | **Update**: detect new stacks, propose additions |
| `rust shell go ...` | **Force stacks**: use specified stacks |

### Mode: --check

1. Verify `hk.pkl` exists
2. Run `hk validate` and `hk check --all`
3. Report results — do NOT enter plan mode
4. If failures, suggest `hk fix --all` or `/hk --update`

### Mode: Auto-detect / Force / Update

#### 1. Enter Plan Mode immediately

#### 2. Detect Stacks

| Indicator | Stack |
|-----------|-------|
| *(always)* | essential |
| `*.sh`, `bin/` with scripts | shell |
| `.github/workflows/*.yml` | github-actions |
| `Cargo.toml` | rust |
| `go.mod` | go |
| `Dockerfile*`, `docker-compose.yml` | docker |
| `*.pkl`, `**/*.yml` (non-GHA) | config-languages |
| `*.lua`, `init.lua` | lua |

#### 3. Analyze Project Context

- `.editorconfig` exists? (affects shfmt)
- `.tmpl` files or chezmoi repo? (add template exclusions)
- Conventional commits? (add commit-msg hook)
- Reference/vendor dirs? (exclude from content-sensitive checks)

#### 4. Fetch Latest hk Version

```bash
mise ls-remote hk | tail -1
```

#### 5. Compose hk.pkl

```pkl
amends "package://github.com/jdx/hk/releases/download/vX.Y.Z/hk@X.Y.Z#/Config.pkl"
import "package://github.com/jdx/hk/releases/download/vX.Y.Z/hk@X.Y.Z#/Builtins.pkl"

local linters = new Mapping<String, Step | Group> {
  // builtins per detected stacks
}

hooks = new {
  ["pre-commit"] { fix = true; stash = "git"; steps = linters }
  ["pre-push"] { steps = linters }
  ["check"] { steps = linters }
  ["fix"] { fix = true; steps = linters }
}
```

#### 6. Present Plan then Exit Plan Mode

Include: detected stacks, proposed `hk.pkl`, tools to install (with versions), gotchas, commit strategy (config files → `hk fix` changes → manual fixes).

#### 7. After Approval — Execute

1. Install tools: `mise use hk@X.Y.Z` (one per command)
2. Write config files
3. Install hooks: `mise x -- hk install --mise`
4. Validate: `mise x -- hk validate`
5. Run checks: `mise x -- hk check --all`
6. Fix if needed: `mise x -- hk fix --all`
7. Commit in sequence per the plan
