# Pipelines (worked example)

Real examples of the pipelines pattern: deterministic shell, judgment in the model, composition by reference. The runner that executes them is [mate](https://github.com/robsonscheffer/mate). You do not need mate to read these.

Every YAML and prompt file here is taken verbatim (or near-verbatim) from mate's shipped recipes. Some files reference mate-specific commands and paths; the value is in seeing the _shape_ of a working pipeline, not in being able to clone-and-run.

## Two scales of example

**A two-stage recipe with a prompt file.** `extract-signal.yaml` runs a shell command to collect input, then a model stage that uses `prompt: ./extract-signal.md` for the prompt. The prompt itself ships next to the recipe. This is the simplest form of "shell gathers, model judges, output flows forward." It also shows `when:` (conditional execution) and `with: tools:` (the agent's tool allowlist).

**A multi-recipe composition.** `plan.yaml` is a four-stage recipe that composes four ops: locate the ticket, run the planner agent, embed the plan into the ticket, transition the ticket to the next state. Each op is a separate file in this folder. This is what a recipe looks like once it has lived in the system for a while: small ops, named, reused across recipes.

## What the examples show

- A pipeline is YAML. Stages run in order. Outputs flow forward by name with `{{stageOutput "id"}}`.
- A stage can be many things: a shell command, a model call (`prompt:` or `prompt_inline:` or `agent:`), an MCP tool invocation, another pipeline, a loop over a list, an op scoped to a git worktree.
- Recipes compose ops. Write an op once, call it from anywhere.
- State transitions are pure shell (`op-transition.yaml`). The model never writes to `status` or `needs` directly.

## On the three forms of model call

A stage that calls the model can point at the prompt three different ways:

- `prompt: ./somefile.md` — the prompt is a sibling file. Best for longer prompts that you want to edit and version on their own. `extract-signal.yaml` uses this form.
- `prompt_inline: |` — the prompt is written directly in the YAML. Best for short, recipe-specific prompts. None of the examples here use this; mate's shipped recipes all prefer separate files.
- `agent: <name>` — the prompt is a Claude Code subagent installed elsewhere (typically `~/.claude/agents/<name>.md`), with its own system prompt and tool allowlist. Best for prompts you want to reuse across multiple recipes, or call from a Claude Code session directly. `op-planner.yaml` uses this form.

All three produce the same kind of stage. They are alternative ways to point at the prompt.

## Background

The shape is older than AI tooling. Ansible playbooks, Kubernetes manifests, CI configs, Makefiles, Just files all share it. [Kestra](https://kestra.io/) sits closer to home: their workflow blueprints already include agent stages, and the shape of a Kestra flow looks much like a mate recipe. The pattern is borrowed widely. The combination here, applied to one person's day rather than a company's infrastructure, is what made it useful for me.

## Files

- `extract-signal.yaml` — two-stage recipe. Shell collects, model classifies and writes. Uses a prompt file.
- `extract-signal.md` — the prompt called by the recipe. A real working prompt, ~120 lines.
- `plan.yaml` — full recipe, four stages, composes the four ops below.
- `op-locate-ticket.yaml` — small deterministic op. Globs the vault, returns a path.
- `op-planner.yaml` — the model call in `plan`. Wraps a Claude Code subagent named `mate-planner`.
- `op-embed-section.yaml` — pure-awk op. Splices a content file into another file before a heading marker.
- `op-transition.yaml` — state-machine op. Mutates frontmatter and appends a Log entry. Every recipe ends with this.

## Why

The reasoning lives in the article that goes with this folder. (Link goes here once published.)
