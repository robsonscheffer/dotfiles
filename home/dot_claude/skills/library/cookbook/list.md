# List Available Skills

## Context

Show the full library catalog with install status.

## Steps

### 1. Sync the Public Catalog

Pull the latest dotfiles and apply:

```bash
cd <CHEZMOI_SOURCE_DIR>
git pull
chezmoi apply
```

### 2. Read the Catalog

- Read `<LIBRARY_YAML_PATH>`
- If `<LIBRARY_LOCAL_YAML_PATH>` exists, read it too
- Merge entries: append local entries to public ones; if a name appears in both, local wins
- Parse all entries from `library.skills`, `library.plugins`, `library.agents`, and `library.prompts`

### 3. Check Install Status

For each skill/agent/prompt entry:

- Determine the type and corresponding default/global directories from `default_dirs`
- Check if a directory matching the entry name exists in the **default** directory
- Check if a directory matching the entry name exists in the **global** directory
- Search recursively for name matches
- Mark as: `installed (default)`, `installed (global)`, or `not installed`

For each plugin entry:

- Check `~/.claude/plugins/installed_plugins.json` for key `<name>@<marketplace>`
- Mark as: `installed` or `not installed`

### 4. Display Results

Format the output as a table grouped by type, with a catalog column:

```
## Skills
| Name | Description | Catalog | Source | Status |
|------|-------------|---------|--------|--------|
| skill-name | skill-description | public | /local/path/... | installed (default) |
| work-skill | work-description | private | ~/work/... | installed (global) |
| other-skill | other-description | public | github.com/... | not installed |

## Plugins
| Name | Marketplace | Description | Catalog | Status |
|------|-------------|-------------|---------|--------|
| superpowers | claude-plugins-official | Core skills library | public | installed |
| context7 | claude-plugins-official | Library docs MCP | public | installed |

## Agents
| Name | Description | Catalog | Source | Status |
|------|-------------|---------|--------|--------|
| agent-name | agent-description | private | /local/path/... | installed (global) |

## Prompts
| Name | Description | Catalog | Source | Status |
|------|-------------|---------|--------|--------|
| prompt-name | prompt-description | public | github.com/... | not installed |
```

If a section is empty, show: `No <type> in catalog.`

### 5. Summary

At the bottom, show:

- Total entries in catalog (public + private)
- Total installed locally
- Total not installed
