---
name: rs-handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work.

Save it to `~/brain/.scratch/YYYY-MM-DD-handoff-<topic>.md` (use today's date and a short kebab-case topic slug) — regardless of which repo or project this session is in. Never write it to `/tmp` or any OS temp directory; those are cleared and not durable. `~/brain` is the durable store for handoffs and research across all of Robson's projects. If `~/brain/.scratch/` doesn't exist, create it.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
