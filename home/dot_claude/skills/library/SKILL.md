---
name: library
description: Private skill distribution system. Use when the user wants to install, use, add, push, remove, sync, list, or search for skills, agents, or prompts from their private library catalog. Triggers on /library commands or mentions of library, skill distribution, or agentic management.
argument-hint: [command or prompt] [name or details]
---

# The Library

A meta-skill for private-first distribution of agentics (skills, agents, prompts, and plugins) across agents, devices, and teams.

## Variables

- **CHEZMOI_SOURCE_DIR**: `~/apps/robsonscheffer/dotfiles`
- **LIBRARY_SOURCE_PATH**: `home/dot_claude/skills/library`
- **LIBRARY_SKILL_DIR**: `~/.claude/skills/library/`
- **LIBRARY_YAML_PATH**: `~/.claude/skills/library/library.yaml`
- **LIBRARY_LOCAL_YAML_PATH**: `~/.claude/skills/library/library.local.yaml`

## How It Works

The Library is a catalog of references to your agentics. Two catalog files work together:

- **`library.yaml`** — public catalog, managed by chezmoi, synced across devices via the dotfiles repo
- **`library.local.yaml`** — private/work catalog, lives only on this machine, never committed to git

Entries define what's _available_ — not what gets installed. You pull specific items on demand with `/library use <name>`.

## Catalog Layering

| File                 | Managed by              | In git? | Contains                      |
| -------------------- | ----------------------- | ------- | ----------------------------- |
| `library.yaml`       | Chezmoi (dotfiles repo) | Yes     | Public skills + plugins       |
| `library.local.yaml` | Manual (local only)     | No      | Work/private skills + plugins |

When reading the catalog, **always merge both files**. Entries from `library.local.yaml` are appended to the corresponding sections in `library.yaml`. If a name appears in both, the local version wins.

## Commands

| Command                     | Purpose                                  |
| --------------------------- | ---------------------------------------- |
| `/library install`          | First-time setup: verify chezmoi config  |
| `/library add <details>`    | Register a new entry in the catalog      |
| `/library use <name>`       | Pull from source (install or refresh)    |
| `/library push <name>`      | Push local changes back to source        |
| `/library remove <name>`    | Remove from catalog and optionally local |
| `/library list`             | Show full catalog with install status    |
| `/library sync`             | Re-pull all installed items from source  |
| `/library search <keyword>` | Find entries by keyword                  |

## Cookbook

Each command has a detailed step-by-step guide. **Read the relevant cookbook file before executing a command.**

| Command | Cookbook                                   | Use When                                                     |
| ------- | ------------------------------------------ | ------------------------------------------------------------ |
| install | [cookbook/install.md](cookbook/install.md) | First-time setup on a new device                             |
| add     | [cookbook/add.md](cookbook/add.md)         | User wants to register a new skill/agent/prompt in catalog   |
| use     | [cookbook/use.md](cookbook/use.md)         | User wants to pull or refresh a skill from the catalog       |
| push    | [cookbook/push.md](cookbook/push.md)       | User improved a skill locally and wants to update the source |
| remove  | [cookbook/remove.md](cookbook/remove.md)   | User wants to remove an entry from the catalog               |
| list    | [cookbook/list.md](cookbook/list.md)       | User wants to see what's available and what's installed      |
| sync    | [cookbook/sync.md](cookbook/sync.md)       | User wants to refresh all installed items at once            |
| search  | [cookbook/search.md](cookbook/search.md)   | User is looking for a skill but doesn't know the exact name  |

**When a user invokes a `/library` command, read the matching cookbook file first, then execute the steps.**

## Source Format

The `source` field in catalog files supports these formats (auto-detected):

- `/absolute/path/to/SKILL.md` — local filesystem
- `https://github.com/org/repo/blob/main/path/to/SKILL.md` — GitHub browser URL
- `https://raw.githubusercontent.com/org/repo/main/path/to/SKILL.md` — GitHub raw URL

Both GitHub URL formats are supported. Parse org, repo, branch, and file path from the URL structure. For private repos, use SSH or `GITHUB_TOKEN` for auth automatically.

**Important:** The source points to a specific file (SKILL.md, AGENT.md, or prompt file). We always pull the entire parent directory, not just the file.

## Source Parsing Rules

**Local paths** start with `/` or `~`:

- Use the path directly. Copy the parent directory of the referenced file.

**GitHub browser URLs** match `https://github.com/<org>/<repo>/blob/<branch>/<path>`:

- Parse: `org`, `repo`, `branch`, `file_path`
- Clone URL: `https://github.com/<org>/<repo>.git`
- File location within repo: `<path>`

**GitHub raw URLs** match `https://raw.githubusercontent.com/<org>/<repo>/<branch>/<path>`:

- Parse: `org`, `repo`, `branch`, `file_path`
- Clone URL: `https://github.com/<org>/<repo>.git`
- File location within repo: `<path>`

## Chezmoi Integration

The public catalog (`library.yaml`) is managed by chezmoi:

- **Source of truth**: `<CHEZMOI_SOURCE_DIR>/<LIBRARY_SOURCE_PATH>/library.yaml`
- **Deployed to**: `<LIBRARY_SKILL_DIR>/library.yaml`

**Reading**: Always read from the deployed path (`<LIBRARY_SKILL_DIR>`).

**Writing to public catalog**: Edit the chezmoi source file, commit to the dotfiles repo, then apply:

```bash
cd <CHEZMOI_SOURCE_DIR>
# edit <LIBRARY_SOURCE_PATH>/library.yaml
git add <LIBRARY_SOURCE_PATH>/library.yaml
git commit -m "library: <change description>"
chezmoi apply
```

**Writing to private catalog**: Edit `<LIBRARY_LOCAL_YAML_PATH>` directly. No git, no chezmoi.

**Syncing**: Pull the dotfiles repo and apply chezmoi to get latest public catalog:

```bash
cd <CHEZMOI_SOURCE_DIR>
git pull
chezmoi apply
```

## GitHub Workflow

When working with GitHub sources, prefer `gh api` for accessing single files (e.g., reading a SKILL.md to check metadata). For pulling entire skill directories, clone into a temp dir per the steps below.

**Fetching (use):**

1. Clone the repo with `git clone --depth 1 <clone_url>` into a temporary directory
2. Navigate to the parent directory of the referenced file
3. Copy that entire directory to the target local directory
4. The temporary directory is cleaned up automatically

**Pushing (push):**

1. Clone the repo with `git clone --depth 1 <clone_url>` into a temporary directory
2. Overwrite the skill directory in the clone with the local version
3. Stage only the relevant changes: `git add <skill_directory_path>`
4. Commit with message: `library: updated <skill name> <what changed>`
5. Push to remote
6. The temporary directory is cleaned up automatically

## Plugins

The library tracks Claude Code plugins as a manifest. Unlike skills/agents/prompts (which are file-copied), plugins are installed via the Claude Code CLI.

**Catalog entry format:**

```yaml
plugins:
  - name: superpowers
    marketplace: claude-plugins-official
    description: Core skills library — TDD, debugging, planning, brainstorming
    install: "claude plugin install superpowers@claude-plugins-official"
```

**How plugins work in library commands:**

- **`/library list`** — show plugins with install status (check `~/.claude/plugins/installed_plugins.json`)
- **`/library use <plugin-name>`** — run the `install` command via Bash
- **`/library sync`** — re-run install for all plugins (idempotent — reinstalls update to latest)
- **`/library add`** — register a new plugin entry with `name`, `marketplace`, `description`, and `install` command
- **`/library remove`** — remove from catalog; optionally uninstall via `claude plugin uninstall <name>@<marketplace>`
- **`/library search`** — search plugins by keyword like any other entry

**Checking install status:**

```bash
cat ~/.claude/plugins/installed_plugins.json | grep -q '"<name>@<marketplace>"'
```

If the key `<name>@<marketplace>` exists in the JSON, the plugin is installed.

## Typed Dependencies

The `requires` field uses typed references to avoid ambiguity:

- `skill:name` — references a skill in the library catalog
- `agent:name` — references an agent in the library catalog
- `prompt:name` — references a prompt in the library catalog
- `plugin:name` — references a plugin in the library catalog

When resolving dependencies: look up each reference in the merged catalog (both files), fetch all dependencies first (recursively), then fetch the requested item.

## Target Directories

By default, items are installed to the **default** directory from `library.yaml`:

```yaml
default_dirs:
  skills:
    - default: .claude/skills/
    - global: ~/.claude/skills/
  agents:
    - default: .claude/agents/
    - global: ~/.claude/agents/
  prompts:
    - default: .claude/commands/
    - global: ~/.claude/commands/
```

- If the user says "global" or "globally", use the `global` directory.
- If the user specifies a custom path, use that path.
- Otherwise, use the `default` directory.

## Example Filled Library Files

**library.yaml** (public, chezmoi-managed):

```yaml
default_dirs:
  skills:
    - default: .claude/skills/
    - global: ~/.claude/skills/
  agents:
    - default: .claude/agents/
    - global: ~/.claude/agents/
  prompts:
    - default: .claude/prompts/
    - global: ~/.claude/prompts/

library:
  skills:
    - name: address-pr-feedback
      description: Walk through PR review comments and propose fixes
      source: https://github.com/robsonscheffer/dotfiles/blob/main/home/dot_claude/skills/address-pr-feedback/SKILL.md

    - name: cmux
      description: cmux terminal multiplexer - manage workspaces, spawn agents
      source: https://github.com/robsonscheffer/dotfiles/blob/main/home/dot_claude/skills/cmux/SKILL.md

  plugins:
    - name: superpowers
      marketplace: claude-plugins-official
      description: Core skills library — TDD, debugging, planning, brainstorming
      install: "claude plugin install superpowers@claude-plugins-official"

  agents: []
  prompts: []
```

**library.local.yaml** (private, gitignored):

```yaml
library:
  skills:
    - name: work-deploy
      description: Deploy services via internal tooling
      source: ~/work/skills/deploy/SKILL.md

    - name: work-ticket-triage
      description: Triage tickets for sprint planning
      source: git@github.com:your-org/internal-skills.git

  plugins:
    - name: internal-dev
      marketplace: org-claude-code
      description: Dev workflow skills for internal tooling
      install: "claude plugin install internal-dev@org-claude-code"

  agents: []
  prompts: []
```
