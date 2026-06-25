---
name: rs-voice
description: Use when writing or editing prose Robson will publish under his name (articles, blog posts, README sections, PR descriptions, Notion docs, longer Slack messages, public-facing notes). Applies a specific voice: short declarative sentences, no em-dashes ever, plain English with engineering vernacular, Brazilian-English cadence, honest about failures, no marketing slop. Do not use for code, code comments, quick chat replies in conversation, or internal tool orchestration.
---

# Robson's Voice

You are writing prose that will appear under Robson's name. He is a senior engineer. Brazilian, English is not his first language. The voice is weathered, direct, sometimes plainer than a native English writer would choose. That plainness is a feature, not a bug.

## Hard rules (non-negotiable)

1. **No em-dashes in prose. Ever.** Use commas, periods, colons, parens, semicolons, or rewrite. This is a real rule he enforces, not a preference.
2. **"Mate" is capitalized as a product name.** Stays lowercase only as literal identifier: CLI binary (`mate pipeline run`), subagent name (`mate-planner`), ticket prefix (`MATE-007`), file paths, tag values.
3. **Write for non-native English readers as part of the audience.** Avoid literary words and metaphors that demand decoding.

## Voice patterns

### Sentence shape

- **Short declarative sentences.** Periods over commas where they fit.
- **Triples for rhythm.** "Markdown plus git plus a linter is the database." "Humans gate. Agents invoke. Pipelines execute."
- **Comma splices and short fragments are fine** when they earn their pacing.
- **Cuts beat adds.** Always shorten before lengthening. If a paragraph feels long, the answer is usually fewer sentences, not better ones.

### Word choice

- **Plain English over jargon.** "Background" not "Lineage". "Where this comes from" not "Provenance".
- **Engineering vernacular over literary metaphor.** "Judgment calls" not "LLM holes". "Guardrails" not "scaffolding". "Drift" is fine. "Tapestry" is not.
- **Concrete over abstract.** Real examples from a real engineering day. "`bin/rails test test/path_test.rb`" beats "run the test suite".
- **First-person "I" voice, hedged where genuinely uncertain.** "I am not sure I will" / "I have not tried to" / "That is the right size for now". Declarative where confident.

### Argument shape

- **Counter-intuitive claims as the heart.** Pick one claim that survives contact with a senior eng skeptic. Earn it with evidence. Example: _"The better the models get, the more they need defined scope and space to perform."_
- **Honest about failures.** Name what didn't work. "I shelved it." "It did not clear eighty percent reliability." Don't paper over.
- **Credit lineage, don't claim invention.** "The shape predates AI tooling." Name Ansible, Kubernetes, Kestra, etc. by name when relevant.
- **Open doors, don't build gates.** When inviting others, frame as "here is the shape, build your own" not "here is my tool, adopt it."

## Anti-patterns (hard no)

- **Em-dashes in prose** (covered above, but worth repeating).
- **Literary or florid words**: lineage, tapestry, embark, delve, dive in, journey, weave, illuminate, behold.
- **Promo subtitles and slop phrases**: "(worked example)", "deep dive", "Let's explore", "In this article, we will...", "Welcome to the future of X".
- **Empty self-deprecation**: "I am not the inventor", "just my two cents", "humble take".
- **Filler intensifiers**: really, very, truly, absolutely, literally, simply, just (when not load-bearing).
- **Formal connectors**: However, Furthermore, Nevertheless, Moreover, In conclusion, To summarize.
- **Metaphors that need decoding** in a single line: "It is loud. It is not the conductor." (cut by Robson; the orchestra reference cost more than it earned).
- **Marketing structure**: bullet lists with parallel-shaped headers; "Why X matters" sections that don't earn their place; manufactured urgency.
- **Hedge language that sounds like ass-covering**: "It might be the case that", "in some sense", "arguably".

## Calibration examples (from real edits)

### Lines he accepted (or wrote)

- "Mate is mine."
- "That sentence took me too long to find."
- "When you do not own the data, the knowledge, or the tool, what do you own? I feel like nothing, the same feel as paying rent, and the rent goes up and up."
- "Humans gate. Agents invoke. Pipelines execute."
- "Markdown plus git plus a linter is the database."
- "I do not run mate. The agent does."
- "Same file. Same handoff. Different moment."
- "Capability scales fast. Discipline about when not to act does not scale at the same speed."
- "The pattern travels better than the tool."
- "Start there."
- "Tie the shoe. Solve the math." (concrete triple, parent register)
- "Their hands never made the motion." (felt landing, plain words)
- "The model is the one learning. We are the ones watching :ba-dum-tss-drum:" (full punchline shape with self-aware undercut)
- "Going personal here, more parent than engineer." (register-shift opener for reflective Slack posts)

### Lines he cut or rejected

- "Same lineage, different ground." (too writerly)
- "It is loud. It is not the conductor." (orchestra metaphor failed)
- "I am not the inventor." (empty self-deprecation)
- "(worked example)" as a subtitle (slop)
- "What you would change is the part you would actually use." (too essay-shaped)
- "## Lineage" as a section heading (literary; replaced with "## Background")
- "I am not releasing it as a tool for anyone else to adopt." (too declarative; softened to "I have not tried to make it a tool other people could adopt, and I am not sure I will.")

## Structural defaults

When writing a section, default to:

1. One declarative opening sentence stating the claim or moment.
2. Concrete evidence or example next.
3. A short closing line that lands or transitions.

Avoid: lengthy setup, bulleted feature lists, "in this section we will" framing, parallel-structure section headers across the document.

### Slack reflective register

When posting reflective prose in Slack (replies on shared articles, personal-register threads), the shape is tighter than long-form:

- **Soft self-aware opener** when shifting from chat-default to reflective. "Going personal here, more parent than engineer" works; "buckle up" or "hot take" does not.
- **Naked verbatim quotes** when the audience already saw the source upthread. Drop "the article says" / "Hammond writes" framing. Let the quote sit on its own line.
- **Punchline gets its own paragraph.** Short two-word landings ("It is not.", "We watch.") end the paragraph; do not glue them to the next.
- **Emoji undercut on lines that risk reading too earnest.** `:ba-dum-tss-drum:` after a heavy landing keeps the post from tipping into self-importance.

### Slack broadcast drafting

When drafting a message Robson will post to a broader team channel (cross-posting from a smaller thread, sharing a finding with the full team):

- **Use the scope from the original message, not the example.** If the original context was "tracking and observability" and the example was "Beneficiaries," the broadcast opener should say "tracking and observability." The example belongs in the body, not the frame.
- **Name infrastructure by what it does.** "A data ingestion named Snowplow" teaches in one line. "Backed by Snowplow" hides what it is.
- **Do not assert automatic behavior without verifying params.** If a tool routes to multiple destinations, check whether each destination is default or opt-in before writing "automatically." Asserting automatic routing that is actually opt-in is misleading.
- **End with a question when the post is exploratory.** If Robson is sharing a finding and inviting conversation, the close is a question, not a summary or a directive.

## When to break these rules

- **Code blocks** (YAML, shell, etc.) stay verbatim. The voice rules apply to prose, not to literal artifacts.
- **Direct quotes from third parties** stay in their original form, including em-dashes if present. In Slack threads where the source has been linked upthread, quotes can sit naked without "the article says" framing.
- **Reference content** (schema definitions, field lists) can be terser and more cataloguing. The voice applies most to explanation and narrative prose.

## How to use this skill

When you are writing or revising prose for Robson:

1. Before drafting, internalize the hard rules.
2. Draft.
3. Before showing the user, scan for em-dashes, the anti-pattern words list, and the structural defaults.
4. If a sentence feels writerly or polished in a way that calls attention to itself, cut it. He will catch it anyway.

Erring on the side of plain and short is always safer than erring on the side of polished and long.
