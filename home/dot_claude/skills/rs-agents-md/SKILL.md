---
name: rs-agents-md
description: Use when generating AGENTS.md/CLAUDE.md pairs for a repo, hub directory, or leaf module. Use when setting up CI linting to enforce the convention. Use when a directory has CLAUDE.md without a sibling AGENTS.md.
---

# Generate AGENTS.md / CLAUDE.md Pairs

## Overview

**AGENTS.md is the single source of truth** for AI context (Claude Code, Cursor, Copilot, Codex). CLAUDE.md exists in the same directory and contains exactly `@AGENTS.md` — nothing else.

**Never generate CLAUDE.md alone.** Always generate the pair.

## The Convention

```
dir/
  AGENTS.md    ← content lives here (tool-agnostic)
  CLAUDE.md    ← contains exactly: @AGENTS.md
```

CLAUDE.md must contain exactly the string `@AGENTS.md` (no trailing newline, no other text). This is enforced by CI (see Tooling section below).

## Three Modes

| Mode     | Use when                                                              | Target length |
| -------- | --------------------------------------------------------------------- | ------------- |
| **root** | Repo root — primary context for all sessions                          | < 100 lines   |
| **hub**  | Directory with multiple sub-modules, each with their own AGENTS.md    | 40–80 lines   |
| **pack** | Leaf module or feature area — actual implementation work happens here | 30–50 lines   |

---

### Mode: root

Root-level AGENTS.md — high-leverage, universally applicable to every session.

**Include:**

- **WHAT**: Key technologies (no version numbers), directory map, non-standard architectural patterns
- **WHY**: One-sentence project purpose, what each major area does
- **HOW**: How to run tests (targeted commands), lint, verify — daily commands only
- **Gotchas**: Repo-specific non-obvious behaviors; things that work unexpectedly

**Exclude:**

- Commit/PR style preferences (→ personal `~/.claude/CLAUDE.md`)
- Deep tool expertise (→ skills)
- Version numbers (go stale)
- Code style/formatting rules (→ linters)

**Structure:**

```markdown
## Overview

One sentence. What is this and what does it do?
**Tech Stack:** key, technologies, listed

## Architecture

How the codebase is organized. Non-standard patterns.

### Key Directories

| Directory | Purpose |

## Commands

### Testing

### Linting & Verification

## Gotchas

- Bullet list of repo-specific surprises

## Further Reading

Pointers to docs, not embedded content.
```

---

### Mode: hub

Hub-level AGENTS.md — routing table for a directory containing multiple sub-modules.

**Steps:**

1. Read each `*/AGENTS.md` in this directory
2. Synthesize purpose per sub-module; do not duplicate their detail
3. Build a routing guide

**Include:**

- 2–3 sentence overview of the domain this directory owns
- Per sub-module: name, one-line description, when to work here
- Cross-module relationships and data flow
- Routing guidance for ambiguous cases ("If working on X, use `module_a/` not `module_b/`")
- What lives elsewhere (adjacent dirs, shared infra)

**Exclude:** detailed implementation guidance, file-by-file descriptions, standard commands, ASCII diagrams

---

### Mode: pack

Pack-level AGENTS.md — deep guidance for working within a specific bounded context.

**Include:**

1. **Module Purpose & Boundaries** — what it does, what it doesn't do, what belongs in adjacent modules
2. **Data Flow & Dependencies** — key inputs/outputs, models manipulated, external systems called
3. **Entry Points** — which modules call in, public APIs, what's internal/private
4. **When to Work Here vs. Elsewhere** — tasks that belong here, what seems related but belongs elsewhere
5. **Core Abstractions** — the 2–5 classes/concepts someone must understand to work safely here
6. **Conventions & Constraints** — naming, folder layout, patterns to follow, performance/security constraints

**Exclude:** details from outside this directory, low-level implementation details, standard commands, file-by-file descriptions, ASCII diagrams

---

## After Generating Content

After writing AGENTS.md, always create the sibling CLAUDE.md:

```bash
echo -n "@AGENTS.md" > CLAUDE.md
```

The file must contain exactly `@AGENTS.md` — no trailing newline, no other content.

---

## CI Tooling (Install Once Per Repo)

After generating the first pair, install a lint check so the convention is enforced going forward.

### Shell script (any repo)

Create `scripts/lint-agents-md.sh`:

```bash
#!/usr/bin/env bash
# Enforces the AGENTS.md/CLAUDE.md convention.
# Every AGENTS.md must have a sibling CLAUDE.md containing exactly "@AGENTS.md".
# Every CLAUDE.md containing "@AGENTS.md" must have a sibling AGENTS.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IGNORE_DIRS=("node_modules" ".next" ".yarn" ".git")

fail=0

find_files() {
  local name="$1"
  local ignores=()
  for d in "${IGNORE_DIRS[@]}"; do ignores+=(-path "*/$d" -prune -o); done
  find "$ROOT" "${ignores[@]}" -name "$name" -print
}

while IFS= read -r agents_md; do
  dir="$(dirname "$agents_md")"
  rel="${dir#$ROOT/}"; [[ "$rel" == "$ROOT" ]] && rel="."
  claude_md="$dir/CLAUDE.md"
  if [[ ! -f "$claude_md" ]]; then
    echo "FAIL: $rel/CLAUDE.md is missing (sibling of $rel/AGENTS.md)"
    fail=1; continue
  fi
  content="$(cat "$claude_md")"
  if [[ "$content" != "@AGENTS.md" ]]; then
    echo "FAIL: $rel/CLAUDE.md must contain exactly \"@AGENTS.md\", got: \"$content\""
    fail=1
  fi
done < <(find_files "AGENTS.md")

while IFS= read -r claude_md; do
  content="$(cat "$claude_md")"
  if [[ "$content" != "@AGENTS.md" ]]; then
    echo "FAIL: $(dirname "$claude_md" | sed "s|$ROOT/||")/CLAUDE.md must contain exactly \"@AGENTS.md\""
    fail=1; continue
  fi
  dir="$(dirname "$claude_md")"
  rel="${dir#$ROOT/}"; [[ "$rel" == "$ROOT" ]] && rel="."
  if [[ ! -f "$dir/AGENTS.md" ]]; then
    echo "FAIL: $rel/CLAUDE.md references @AGENTS.md but $rel/AGENTS.md does not exist"
    fail=1
  fi
done < <(find_files "CLAUDE.md")

[[ $fail -eq 0 ]] && echo "OK: AGENTS.md/CLAUDE.md convention passes"
exit $fail
```

```bash
chmod +x scripts/lint-agents-md.sh
```

Wire to CI: add `bash scripts/lint-agents-md.sh` to your lint step or pre-commit hook.

### Vitest/Jest variant (JS/TS repos)

Add `src/test/agents-md-claude-md.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const IGNORE = new Set(["node_modules", ".next", ".yarn"]);

function findFiles(dir: string, fileName: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findFiles(full, fileName));
    else if (entry.name === fileName) results.push(full);
  }
  return results;
}

describe("AGENTS.md / CLAUDE.md convention", () => {
  it("every AGENTS.md has a sibling CLAUDE.md that references it", () => {
    const failures: string[] = [];
    for (const agentsMd of findFiles(ROOT, "AGENTS.md")) {
      const dir = path.dirname(agentsMd);
      const rel = path.relative(ROOT, dir) || ".";
      const claudeMd = path.join(dir, "CLAUDE.md");
      if (!fs.existsSync(claudeMd)) {
        failures.push(`${rel}/CLAUDE.md is missing`);
        continue;
      }
      const content = fs.readFileSync(claudeMd, "utf-8").trim();
      if (content !== "@AGENTS.md")
        failures.push(
          `${rel}/CLAUDE.md must be exactly "@AGENTS.md", got: "${content}"`,
        );
    }
    expect(failures).toEqual([]);
  });

  it("every CLAUDE.md that references @AGENTS.md has a sibling AGENTS.md", () => {
    const failures: string[] = [];
    for (const claudeMd of findFiles(ROOT, "CLAUDE.md")) {
      const content = fs.readFileSync(claudeMd, "utf-8").trim();
      const dir = path.dirname(claudeMd);
      const rel = path.relative(ROOT, dir) || ".";
      if (content !== "@AGENTS.md") {
        failures.push(
          `${rel}/CLAUDE.md must be exactly "@AGENTS.md", got: "${content}"`,
        );
        continue;
      }
      if (!fs.existsSync(path.join(dir, "AGENTS.md")))
        failures.push(
          `${rel}/CLAUDE.md references @AGENTS.md but ${rel}/AGENTS.md does not exist`,
        );
    }
    expect(failures).toEqual([]);
  });
});
```

---

## Common Mistakes

| Mistake                             | Fix                                                             |
| ----------------------------------- | --------------------------------------------------------------- |
| CLAUDE.md has actual content        | Move all content to AGENTS.md; CLAUDE.md = `@AGENTS.md` only    |
| AGENTS.md exists without CLAUDE.md  | `echo -n "@AGENTS.md" > CLAUDE.md`                              |
| CLAUDE.md is a symlink to AGENTS.md | Replace with `@AGENTS.md` import — symlinks break on some tools |
| CLAUDE.md has trailing newline      | Use `echo -n` not `echo`                                        |
