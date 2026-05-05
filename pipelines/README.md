# Pipelines (worked example)

A small, real example of the pipelines pattern: deterministic shell, judgment in the model, composition by reference. One recipe (`plan.yaml`) and the two ops it calls (`op-locate-ticket.yaml`, `op-transition.yaml`). The runner that executes them is [mate](https://github.com/robsonscheffer/mate). You do not need mate to read these.

## What this shows

- A pipeline is YAML. Stages run in order. Outputs flow forward by name with `{{stageOutput "id"}}`.
- A stage can be many things: a shell command, a model call, an MCP tool invocation, another pipeline, a loop over a list, an op scoped to a git worktree. Most stages are shell. One is a model call (a sub-pipeline named `op-planner`, not included here).
- Recipes compose ops. The op that locates a ticket file is a separate file, called by reference. Write once, call from anywhere.
- State transitions are pure shell (`op-transition.yaml`). The model never writes to `status` or `needs` directly.

## Lineage

The shape is older than AI tooling. Ansible playbooks, Kubernetes manifests, CI configs, Makefiles, Just files all share it. [Kestra](https://kestra.io/) sits closer to home: their workflow blueprints already include agent stages, and the shape of a Kestra flow looks much like a mate recipe. The pattern is borrowed widely. The combination here, applied to one person's day rather than a company's infrastructure, is what made it useful for me.

## Files

- `plan.yaml` — recipe, four stages: locate ticket, run planner agent, embed plan into ticket, transition state.
- `op-locate-ticket.yaml` — small deterministic op. Globs the vault, returns a path.
- `op-transition.yaml` — state-machine op. Mutates the ticket's frontmatter and appends a Log entry. Every recipe ends with this.

`op-planner` and `op-embed-section` are referenced by `plan.yaml` but not included here. They follow the same shape: each is a separate YAML file with one stage.

## Why

The reasoning lives in the article that goes with this folder. (Link goes here once published.)
