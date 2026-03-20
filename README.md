# dotfiles

Personal dotfiles managed with [chezmoi](https://www.chezmoi.io/). Focused on Claude Code agent setup (skills, hooks, settings) and core dev configs.

## What's Managed

| Config | Description |
|--------|-------------|
| `~/.zshrc` | Zsh shell config (Oh My Zsh, p10k, aliases) |
| `~/.gitconfig` | Git config (1Password signing, LFS, templated identity) |
| `~/.config/git/ignore` | Global gitignore |
| `~/.config/mise/config.toml` | Mise runtime versions |
| `~/.config/gh-dash/config.yml` | gh-dash PR dashboard |
| `~/.claude/CLAUDE.md` | Claude Code global instructions |
| `~/.claude/CLAUDE.local.md` | Claude Code personal instructions |
| `~/.claude/settings.json` | Claude Code settings, hooks, permissions |
| `~/.claude/skills/*` | 30 Claude Code skills |
| `~/.claude/hooks/*` | 5 Claude Code hooks |

## What's NOT Tracked

- `~/.claude/settings.local.json` — machine-specific overrides
- `~/.claude/.credentials.json` — auth tokens
- `~/.zshrc.secrets` — API keys and tokens
- `~/.p10k.zsh` — Powerlevel10k theme config
- `~/.agentic/` — agentic runtime state
- `~/.workbench/` — workspace system state

## Quick Start

```bash
# Clone
git clone git@github.com:robsonscheffer/dotfiles.git ~/apps/robsonscheffer/dotfiles

# Bootstrap (installs Homebrew packages, chezmoi, applies dotfiles)
./install.sh

# Or apply manually
chezmoi init --source ~/apps/robsonscheffer/dotfiles/home --apply
```

## Adding/Updating Configs

```bash
# Edit a managed file, then update the source
chezmoi re-add ~/.zshrc

# Or edit directly in the source directory
# (files use chezmoi naming: dot_zshrc, dot_gitconfig.tmpl, etc.)

# Preview changes before applying
chezmoi diff

# Apply changes
chezmoi apply
```

## Structure

```
dotfiles/
├── .githooks/pre-commit    # Blocks work-specific patterns from commits
├── .denied-patterns        # Regex patterns that must never be committed
├── .chezmoi.toml.tmpl      # Chezmoi config (prompted git identity)
├── Brewfile                # Homebrew packages
├── install.sh              # Bootstrap script
└── home/                   # Chezmoi source directory
    ├── dot_zshrc
    ├── dot_gitconfig.tmpl
    ├── dot_config/
    │   ├── git/ignore
    │   ├── mise/config.toml
    │   └── gh-dash/config.yml
    └── dot_claude/
        ├── CLAUDE.md
        ├── CLAUDE.local.md
        ├── settings.json
        ├── skills/         # 30 skill directories
        └── hooks/          # 5 hook directories
```

## Safety

A pre-commit hook scans staged changes for work-specific patterns (company names, internal URLs, ticket IDs) defined in `.denied-patterns`. This prevents accidentally leaking org-specific references.
