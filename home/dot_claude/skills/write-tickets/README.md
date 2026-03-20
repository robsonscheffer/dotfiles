# write-tickets

Transform inputs into well-structured project tickets. Supports a fast path (yeet mode) for single scoped tickets and a full pipeline for multi-ticket decomposition.

## Architecture

This skill follows the [Agent Skills open standard](https://agentskills.io) convention for file organization:

- `assets/` — static resources (templates that define ticket structure)
- `references/` — documentation loaded on demand (profiles, quality rules)

```
write-tickets/
├── README.md              ← you are here
├── SKILL.md               ← process orchestrator (mode detection, gathering, confirmation, Jira setup)
├── config.json            ← optional user config (not committed — create your own)
├── assets/                ← templates: what sections exist per ticket type
│   ├── feature-template.md
│   ├── bug-template.md
│   ├── tech-debt-template.md
│   └── epic-template.md
└── references/            ← rendering guidance, loaded on demand by SKILL.md
    ├── quality-rules.md   ← universal invariants (links, structure, content rules)
    └── profiles/
        ├── minimal.md     ← yeet mode default (5-15 lines)
        └── standard.md    ← full mode default (15-40 lines)
```

## Configuration

Create a `config.json` file in the skill directory to skip repeated setup questions. This file is personal and should not be committed.

```json
{
  "default_mode": "yeet",
  "output_mode": "jira",
  "jira": {
    "project": "PROJ",
    "component": "Growth - Core"
  }
}
```

| Field | Values | Effect |
| --- | --- | --- |
| `default_mode` | `"yeet"` or `"full"` | Skips mode selection question. User can still override inline. |
| `output_mode` | `"jira"` or `"clipboard"` | Skips "Jira or clipboard?" question. Falls back to clipboard if MCP is unavailable. |
| `jira.project` | JIRA project key | Skips "Which project?" question. |
| `jira.component` | JIRA component name | Skips "Which component?" question. |

All fields are optional. Missing fields fall back to interactive prompts.

Quick setup (edit values to match your team):

```sh
echo '{"default_mode":"yeet","output_mode":"jira","jira":{"project":"PROJ","component":"Growth - Core"}}' | jq . > "$(dirname "$(find ~/.claude -path '*/write-tickets/SKILL.md' 2>/dev/null | head -1)")/config.json"
```

### Four concerns, four homes

| Concern        | What it does                                                         | Where it lives                |
| -------------- | -------------------------------------------------------------------- | ----------------------------- |
| **Process**    | Mode selection, gathering, confirmation loops, Jira setup            | `SKILL.md`                    |
| **Structure**  | What sections exist for each ticket type                             | `assets/*.md`                 |
| **Rendering**  | How aggressively to include/omit sections, type-specific guidance    | `references/profiles/*.md`    |
| **Invariants** | Rules that apply to every ticket regardless of mode/profile/template | `references/quality-rules.md` |

### How rendering works

When writing a ticket, SKILL.md instructs the AI to read three things:

1. **Template** (structure) — which sections exist for this ticket type
2. **Profile** (style) — how aggressively to include/omit sections
3. **Quality rules** (invariants) — universal rules like "no local file paths"

All three are one level from SKILL.md — flat references, no chains. SKILL.md is the sole router; reference files never link to other reference files.

### Template x Profile model

Templates define _what sections exist_ (structure). Profiles define _how aggressively to include/omit_ (rendering style). The same feature template rendered with the minimal profile produces a very different ticket than with the standard profile.

Profiles are the single authority for rendering decisions. They absorb tech specs guidance, bug-specific section rules, size calibration, and edge case heuristics — so the AI reads one profile and knows how to render.
