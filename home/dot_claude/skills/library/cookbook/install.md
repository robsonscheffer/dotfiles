# Install The Library

## Context
First-time setup of The Library on a new device. The library is managed by chezmoi as part of the dotfiles repo — no separate clone needed.

## Steps

### 1. Check Prerequisites
- Verify `git` is installed: `git --version`
- Verify `chezmoi` is installed: `chezmoi --version`
- Verify the dotfiles repo is cloned: `ls <CHEZMOI_SOURCE_DIR>`

### 2. Apply Chezmoi
Ensure the library files are deployed:
```bash
cd <CHEZMOI_SOURCE_DIR>
git pull
chezmoi apply
```

### 3. Verify Installation
- Confirm SKILL.md exists at `<LIBRARY_SKILL_DIR>/SKILL.md`
- Confirm library.yaml exists at `<LIBRARY_SKILL_DIR>/library.yaml`
- Confirm the `/library` command is now available

### 4. Create Local Catalog (optional)
If the user has private/work skills, create the local catalog:
```bash
cat > <LIBRARY_LOCAL_YAML_PATH> <<'EOF'
library:
  skills: []
  agents: []
  prompts: []
EOF
```

This file is gitignored and never leaves the machine.

### 5. Done
Tell the user:
- The Library is now globally available
- `/library list` will show the catalog
- `/library add` to start adding skills, agents, and prompts
- Private/work skills go in `library.local.yaml`
