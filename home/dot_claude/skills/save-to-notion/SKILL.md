---
name: save-to-notion
description: Use when saving brainstorms, plans, designs, queries, or documents to Notion for future reference
---

**Config:** Read [config.json](config.json) before proceeding.

# Save to Notion

Save documents to a Notion workspace without fetching schemas.

## Setup

If the Config above is empty `{}`, create `~/.claude/skills/save-to-notion/config.json`:

```json
{
  "databases": {
    "documents": "YOUR-DOCUMENTS-DATABASE-ID",
    "features": "YOUR-FEATURES-DATABASE-ID",
    "repositories": "YOUR-REPOSITORIES-DATABASE-ID"
  }
}
```

To find database IDs: Open database in Notion → Share → Copy link → extract ID from URL.

## Quick Reference

Use the database IDs from the Config above with `notion-create-pages`.

## Database Schemas

### Documents

```
Title    (title, required)
Status   (select: Draft | In Progress | Complete | Archived)
Type     (select: Brainstorm | Design | Plan)
Feature  (relation to Features - use page URL)
```

### Features

```
Name         (title, required)
Description  (text)
Repositories (relation to Repositories - use page URL)
Status       (select: Not Started | In Progress | Complete | On Hold)
```

### Repositories

```
Name         (title, required)
Description  (text)
Path         (text - local filesystem path)
```

## Example: Create Document

```json
{
  "parent": { "data_source_id": "<documents-id-from-config>" },
  "pages": [
    {
      "properties": {
        "Title": "My Document Title",
        "Status": "Draft",
        "Type": "Plan"
      },
      "content": "## Overview\nDocument content in markdown..."
    }
  ]
}
```

## Workflow

1. Read config.json to get database IDs
2. **Most cases:** Create document directly in Documents database
3. **New feature work:** Create Feature first, then link documents to it
4. **New repository:** Create Repository, then Features, then Documents

## Content Format

Use Notion-flavored markdown. Key syntax:

- Headers: `## Section`
- Code blocks: triple backticks with language
- Tables: standard markdown tables
- No title in content (it's in properties)
