# Pipelines (worked example)

Two real examples of the pipelines pattern: deterministic shell, judgment in the model, composition by reference. The runner that executes them is [mate](https://github.com/robsonscheffer/mate). You do not need mate to read these.

## Two scales of example

**Smallest possible.** `summarize-diff.yaml` is one file. Two stages: a shell command that captures `git diff --staged`, then a model call with the prompt written inline in the YAML. No external prompt file, no sub-pipelines. The whole thing fits on one screen.

**Real recipe.** `plan.yaml` is a four-stage recipe used to plan an implementation ticket. It composes four ops: locate the ticket, run the planner agent, embed the plan into the ticket, transition the ticket to the next state. Each op is a separate file in this folder. This is what a recipe looks like once it has lived in the system for a while: small ops, named, reused across recipes.

## What the examples show

- A pipeline is YAML. Stages run in order. Outputs flow forward by name with `{{stageOutput "id"}}`.
- A stage can be many things: a shell command, a model call (`prompt_inline:` or `prompt:` or `agent:`), an MCP tool invocation, another pipeline, a loop over a list, an op scoped to a git worktree.
- Recipes compose ops. Write an op once, call it from anywhere.
- State transitions are pure shell (`op-transition.yaml`). The model never writes to `status` or `needs` directly.

## On `agent: mate-planner` in `op-planner.yaml`

That line means: "in this stage, run a Claude Code subagent named `mate-planner`." The subagent is a separate markdown file installed under `~/.claude/agents/`, with its own system prompt and tool allowlist. The pipeline does not embed the prompt; it references the subagent by name.

This is one of three ways to call the model from a stage:

- `prompt_inline: |` — the prompt is right there in the YAML, as in `summarize-diff.yaml`. Best for short, recipe-specific prompts.
- `prompt: ./somefile.md` — the prompt is a sibling file. Best for longer prompts that you want to edit and version on their own.
- `agent: <name>` — the prompt is a Claude Code subagent installed elsewhere. Best for prompts you want to reuse across multiple recipes, or call from a Claude Code session directly.

All three produce the same kind of stage. They are alternative ways to point at the prompt.

## Background

The shape is older than AI tooling. Ansible playbooks, Kubernetes manifests, CI configs, Makefiles, Just files all share it. [Kestra](https://kestra.io/) sits closer to home: their workflow blueprints already include agent stages, and the shape of a Kestra flow looks much like a mate recipe. The pattern is borrowed widely. The combination here, applied to one person's day rather than a company's infrastructure, is what made it useful for me.

## Files

- `summarize-diff.yaml` — minimal recipe. Shell + inline-prompt model call. The 30-second read.
- `plan.yaml` — full recipe, four stages, composes the four ops below.
- `op-locate-ticket.yaml` — small deterministic op. Globs the vault, returns a path.
- `op-planner.yaml` — the model call in `plan`. Wraps a Claude Code subagent named `mate-planner` (see note above).
- `op-embed-section.yaml` — pure-awk op. Splices a content file into another file before a heading marker.
- `op-transition.yaml` — state-machine op. Mutates frontmatter and appends a Log entry. Every recipe ends with this.

## Why

The reasoning lives in the article that goes with this folder. (Link goes here once published.)
