# Add a New Entry to the Library

## Context
Register a new skill, agent, or prompt in the library catalog.

## Input
The user provides: name, description, source, and optionally type and dependencies.

## Steps

### 1. Sync the Public Catalog
Pull the latest dotfiles and apply:
```bash
cd <CHEZMOI_SOURCE_DIR>
git pull
chezmoi apply
```

### 2. Determine the Type
Figure out the type from the user's prompt or the source path:
- If the source path contains `SKILL.md` or user says "skill" -> type is `skill`
- If the source path contains `AGENT.md` or user says "agent" -> type is `agent`
- If user says "prompt" -> type is `prompt`
- If ambiguous, ask the user

### 3. Determine Public or Private
Ask the user: **"Public or private?"**

- **Public**: Entry goes in `library.yaml` (chezmoi-managed, synced across devices, committed to dotfiles repo)
- **Private**: Entry goes in `library.local.yaml` (local only, never committed)

If the source points to a private/work repo or contains work-specific references, default to private.

### 4. Validate the Source
- **Local path**: Verify the file exists at the given path
- **GitHub URL**: Verify the URL is well-formed (matches browser or raw URL patterns)
- Confirm the source points to a specific file, not a directory

### 5. Parse Dependencies
Detect dependencies by looking through the skill/agent/prompt files, format them as typed references:
- `skill:name`, `agent:name`, `prompt:name`
- Verify each dependency already exists in the merged catalog (both files) or warn the user
  - If they don't exist add them to the appropriate catalog first. If those files have dependencies, add them recursively.
  - You can detect these sometimes by looking at the frontmatter, and then in the file content look for `/<prompt|agent|skill>:name` references. If you're not sure, ask the user if they have any dependencies.

### 6. Add the Entry

**YAML formatting rules:**
- 2-space indentation
- List items use `- ` prefix
- Properties are indented under the list item
- Keep entries alphabetically sorted by name within each section
- For skills reference the `.../<skill-name>/SKILL.md` file
- For agents reference the `.../<agent name>.md` file
- For prompts reference the `.../<prompt name>.md` file (installed to `.claude/commands/`)

**If public** — edit the chezmoi source:
```yaml
# Edit <CHEZMOI_SOURCE_DIR>/<LIBRARY_SOURCE_PATH>/library.yaml
# Under library.skills, library.agents, or library.prompts
- name: <name>
  description: <description>
  source: <source>
  requires: [<typed:refs>]  # omit if no dependencies
```

**If private** — edit the local catalog directly:
```yaml
# Edit <LIBRARY_LOCAL_YAML_PATH>
# Under library.skills, library.agents, or library.prompts
- name: <name>
  description: <description>
  source: <source>
  requires: [<typed:refs>]  # omit if no dependencies
```

### 7. Commit and Deploy

**If public:**
```bash
cd <CHEZMOI_SOURCE_DIR>
git add <LIBRARY_SOURCE_PATH>/library.yaml
git commit -m "library: added <type> <name>"
chezmoi apply
```

**If private:**
No commit needed — the file is local only. Just confirm the entry was added.

### 8. Confirm
Tell the user the entry has been added and is now available via `/library use <name>`.
- If public: mention it will sync to other devices via `chezmoi update`
- If private: mention it stays on this machine only
