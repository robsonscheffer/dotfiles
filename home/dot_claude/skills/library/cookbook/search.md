# Search the Library

## Context
Find entries in the catalog by keyword when the user doesn't remember the exact name.

## Input
The user provides a keyword or description.

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
- Parse all entries from `library.skills`, `library.agents`, and `library.prompts`

### 3. Search
- Match the keyword (case-insensitive) against:
  - Entry `name`
  - Entry `description`
- A match is any entry where the keyword appears as a substring in either field
- Collect all matches across all types

### 4. Display Results

If matches found, format as:

```
## Search Results for "<keyword>"

| Type | Name | Description | Catalog | Source |
|------|------|-------------|---------|--------|
| skill | matching-skill | description... | public | source... |
| skill | work-matching | description... | private | source... |
```

If no matches:
```
No results found for "<keyword>".

Tip: Try broader keywords or run `/library list` to see the full catalog.
```

### 5. Suggest Next Step
If matches were found, suggest: `Run /library use <name> to install one of these.`
