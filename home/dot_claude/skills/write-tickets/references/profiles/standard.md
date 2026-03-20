# Standard Profile

Use all template sections that have content. Be thorough but not verbose.

**Default for:** Full mode
**Target size:** 15-40 lines of ticket body

## Section Rules

- **Summary:** Required. Clear and specific.
- **Context:** Required. Explain the why — workflows, user goals, dependent systems.
- **Acceptance Criteria:** Required. Checkboxes with nested details when needed.
- **Tech Specs:** Include when codebase was explored. 3-5 bullets: entry points, patterns to follow, gotchas.
- **User Story:** Optional. Include if user-facing and the role/capability/benefit framing adds clarity.
- **Proposed Approach:** Include if multiple approaches exist or the path is non-obvious.
- **Additional Context:** Include source links, related PRs, meeting notes, docs.

## Style

- Use all sections that have content.
- Err on the side of including context — the reader may not have been in the room.
- Keep each section focused — Context explains why, AC defines done, Tech Specs points to code.
- Link at first mention, don't re-link the same item.

## Type Adjustments

| Type  | Summary style                  | Context                                                           | AC                           | Tech Specs               |
| ----- | ------------------------------ | ----------------------------------------------------------------- | ---------------------------- | ------------------------ |
| Story | "Add [capability] to [area]"   | Yes, include workflows                                            | Yes, with nested details     | Yes if codebase explored |
| Bug   | "Fix [symptom] in [component]" | Include Steps to Reproduce, Expected, Actual as separate sections | Yes, include regression test | Yes                      |
| Task  | "[Verb] [thing]"               | Yes, explain why now                                              | Yes                          | If helpful               |
| Epic  | "[Verb] [area/capability]"     | Problem Statement: full context, workflows affected, stakeholders | N/A                          | N/A                      |

## Edge Cases

Before finalizing, consider: does this change touch state transitions, async timing, existing data, or external integrations? If so, surface relevant edge cases in AC or Tech Specs.
