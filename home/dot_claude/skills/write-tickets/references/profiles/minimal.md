# Minimal Profile

Render with maximum conciseness. Every word earns its place.

**Default for:** Yeet mode
**Target size:** 5-15 lines of ticket body (validated against Yehuda's tickets)

## Section Rules

- **Summary:** Required. Imperative mood, one sentence. Link at first mention.
- **Context:** Only if "why" isn't obvious from Summary. 1-2 sentences max.
- **Acceptance Criteria:** Required. Testable outcomes, not implementation steps. 3-5 bullets.
- **Tech Specs:** Only if non-obvious. 1-3 bullets: entry points and gotchas only.
- **User Story:** Never include.
- **Proposed Approach:** Only if the approach is non-obvious and would surprise the implementer.
- **Additional Context:** Only for source links already in the input.

## Style

- Omit sections freely — if it would be empty or redundant, it doesn't exist.
- No filler, no boilerplate. If a section restates another, drop it.
- Link at first mention — usually in Summary, don't re-link later.

## Type Adjustments

| Type  | Summary style                  | Context                                                                 | AC                     | Tech Specs     |
| ----- | ------------------------------ | ----------------------------------------------------------------------- | ---------------------- | -------------- |
| Story | "Add [capability] to [area]"   | Only if "why" isn't obvious                                             | Yes, testable outcomes | If non-obvious |
| Bug   | "Fix [symptom] in [component]" | Repro steps if known; merge Steps/Expected/Actual into Context if brief | Yes                    | Usually yes    |
| Task  | "[Verb] [thing]"               | Usually skip                                                            | Often skip             | If helpful     |
| Epic  | "[Verb] [area/capability]"     | Problem Statement: 1-2 sentences, why this matters                      | N/A                    | N/A            |

## Edge Cases

Before finalizing, consider: does this change touch state transitions, async timing, existing data, or external integrations? If so, surface relevant edge cases in AC or Tech Specs — but only when the "obvious" implementation would miss them.
