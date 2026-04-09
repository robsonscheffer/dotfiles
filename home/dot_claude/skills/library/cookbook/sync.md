# Sync All Installed Items

## Context

Refresh every locally installed skill, agent, and prompt by re-pulling from its source. A fast, lazy "make sure everything is up to date" command.

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

### 3. Find All Installed Items

For each entry in the merged catalog:

- Determine the type (skill, agent, prompt) and corresponding directories from `default_dirs`
- Check if a directory or file matching the entry name exists in the **default** directory
- Check if a directory or file matching the entry name exists in the **global** directory
- Search recursively for name matches
- Collect every entry that is installed locally (either default or global)
- If nothing is installed, tell the user and exit

### 4. Re-install Plugins

For each plugin entry in the merged catalog:

- Run the `install` command from the entry via Bash (e.g., `claude plugin install superpowers@claude-plugins-official`)
- This is idempotent — reinstalling updates to the latest version
- Report success or failure per plugin

### 5. Re-pull Each Installed Skill/Agent/Prompt

For each installed entry, fetch the latest from its source:

**If source is a local path** (starts with `/` or `~`):

- Resolve `~` to the home directory
- Get the parent directory of the referenced file
- For skills: copy the entire parent directory to the target:
  ```bash
  cp -R <parent_directory>/ <target_directory>/<name>/
  ```
- For agents/prompts: copy just the file to the target

**If source is a GitHub URL**:

- Parse the URL to extract: `org`, `repo`, `branch`, `file_path`
- Clone into a temporary directory:
  ```bash
  tmp_dir=$(mktemp -d)
  git clone --depth 1 --branch <branch> https://github.com/<org>/<repo>.git "$tmp_dir"
  ```
- Copy the parent directory of the file to the target:
  ```bash
  cp -R "$tmp_dir/<parent_path>/" <target_directory>/<name>/
  ```
- Clean up:
  ```bash
  rm -rf "$tmp_dir"
  ```

**If clone fails (private repo)**, try SSH:

```bash
git clone --depth 1 --branch <branch> git@github.com:<org>/<repo>.git "$tmp_dir"
```

### 6. Resolve Dependencies

For each installed entry that has a `requires` field:

- Check if each dependency is also installed
- If a dependency is not installed, pull it as well
- Process dependencies before the items that require them

### 7. Report Results

Display a summary table:

```
## Sync Complete

| Type | Name | Catalog | Status |
|------|------|---------|--------|
| skill | skill-name | public | refreshed |
| skill | work-skill | private | refreshed |
| agent | agent-name | public | failed: <reason> |

Synced: X items
Failed: Y items
```

If any items failed (e.g., network error, missing source), list them with the reason so the user can fix individually.
