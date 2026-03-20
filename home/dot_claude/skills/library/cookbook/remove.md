# Remove an Entry from the Library

## Context
The user wants to remove a skill, agent, or prompt from the library catalog and optionally delete the local copy.

## Input
The user provides a skill name or description.

## Steps

### 1. Sync the Public Catalog
Pull the latest dotfiles and apply:
```bash
cd <CHEZMOI_SOURCE_DIR>
git pull
chezmoi apply
```

### 2. Find the Entry
- Read both `<LIBRARY_YAML_PATH>` and `<LIBRARY_LOCAL_YAML_PATH>` (if it exists)
- Search across all sections for the matching entry
- Determine the type (skill, agent, or prompt)
- Note which file the entry is in (public or private)
- If no match, tell the user the item wasn't found in the catalog

### 3. Confirm with User
Show the entry details and ask:
- "Remove **<name>** from the library catalog?"
- If installed locally, also ask: "Also delete the local copy at `<path>`?"

### 4. Remove from Catalog

**If entry is in `library.yaml` (public):**
- Edit `<CHEZMOI_SOURCE_DIR>/<LIBRARY_SOURCE_PATH>/library.yaml`
- Remove the entry from the appropriate section

**If entry is in `library.local.yaml` (private):**
- Edit `<LIBRARY_LOCAL_YAML_PATH>` directly
- Remove the entry from the appropriate section

If other entries depend on this one (via `requires`), warn the user before proceeding.

### 5. Delete Local Copy (if requested)
If the user confirmed local deletion:
- Check the default directory for the type (from `default_dirs`)
- Check the global directory
- Remove the directory or file:
  ```bash
  rm -rf <target_directory>/<name>
  ```

### 6. Commit (if public)

**If the entry was in `library.yaml`:**
```bash
cd <CHEZMOI_SOURCE_DIR>
git add <LIBRARY_SOURCE_PATH>/library.yaml
git commit -m "library: removed <type> <name>"
chezmoi apply
```

**If the entry was in `library.local.yaml`:**
No commit needed.

### 7. Confirm
Tell the user:
- The entry has been removed from the catalog
- Whether it was public or private
- Whether the local copy was also deleted
- If other entries depended on it, remind them to update those entries
