---
name: agents-local-md
description: "Generate machine-specific AGENTS.local.md with host facts and system tool details"
argument-hint: "[--force]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(uname:*)
  - Bash(hostname:*)
  - Bash(command -v:*)
  - Bash(which:*)
  - Bash(zsh --version:*)
  - Bash(tmux -V:*)
  - Bash(nvim --version:*)
  - Bash(chezmoi data:*)
  - Bash(readlink:*)
  - Bash(test -f:*)
  - Bash(test -L:*)
  - Bash(stat:*)
  - Bash(date:*)
  # NOTE: Write and ln require user approval (intentional)
---

# Generate AGENTS.local.md

Probe this machine's environment and write `AGENTS.local.md` — a machine-specific context file
that Claude Code auto-loads via `CLAUDE.local.md` symlink.

## Arguments

```
$ARGUMENTS
```

Options:
- `--force` — regenerate even if the file is fresh

## Instructions

### 1. Freshness Check

If `AGENTS.local.md` exists in the repo root:

```bash
stat -f %m AGENTS.local.md 2>/dev/null || stat -c %Y AGENTS.local.md 2>/dev/null
```

Read the file and extract the `Generated:` line. If ALL of these are true, report "AGENTS.local.md
is current (generated DATE on HOSTNAME)" and **stop**:
- File is less than 7 days old
- Hostname in file matches current hostname
- OS in file matches current OS
- `--force` was NOT passed in arguments

Otherwise, continue to regenerate.

### 2. Probe System Identity

Gather:
```bash
uname -s        # OS kernel (Darwin/Linux)
uname -m        # Architecture (x86_64/arm64)
hostname -s     # Short hostname
```

Determine which system package manager is available:
- macOS: `command -v brew`

### 3. Probe Core System Tools

Only probe tools that **vary across systems and affect agent behavior**: **zsh, tmux, nvim**.

For each tool, collect:
- Version: `zsh --version`, `tmux -V`, `nvim --version`
- Path: `command -v <tool>`

### 4. Chezmoi Platform Detection

```bash
chezmoi data --format json | grep -E '"os"|"arch"|"hostname"'
```

### 5. Write AGENTS.local.md

Write the file to the **repo root** (`AGENTS.local.md`). Target **<30 lines**.

```markdown
# AGENTS.local.md

> Machine-specific context for coding agents. Auto-generated — do not edit.
> Regenerate with `/agents-local-md --force`.

Generated: YYYY-MM-DD on HOSTNAME (OS ARCH)

## System

- **OS:** macOS 15.x (Darwin)
- **Arch:** arm64
- **Hostname:** name
- **Package manager:** brew (`/opt/homebrew/bin/brew`)

## Core Tools

| Tool | Version | Path |
|------|---------|------|
| zsh  | 5.9     | `/bin/zsh` |
| tmux | 3.5a    | `/opt/homebrew/bin/tmux` |
| nvim | 0.11.x  | `/opt/homebrew/bin/nvim` |

## Chezmoi Platform

chezmoi sees: os=`darwin`, arch=`arm64`, hostname=`name`
```

**What does NOT belong:** mise-pinned tools, third-party brew tools, session-ephemeral data.

### 6. Create Symlink

```bash
ln -sf AGENTS.local.md CLAUDE.local.md
```

### 7. Verify

Confirm `AGENTS.local.md` exists, `CLAUDE.local.md` symlinks to it, and both are gitignored.
