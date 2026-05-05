# Pipelines

A folder of real pipeline files: two recipes, four ops, and one prompt file. The point is to show the shape of a working pipeline. Some files reference workflow-specific commands and paths; reading them is more useful than running them.

## Where to start

If you have not seen a pipeline before, read these in order:

1. **`extract-signal.yaml`** with **`extract-signal.md`** (about 5 minutes). A two-stage recipe. A shell command collects findings, then a model stage classifies them using a separate prompt file. The simplest "shell gathers, model judges, output flows" shape.

2. **`plan.yaml`** with the four `op-*.yaml` files (about 10 minutes). A four-stage recipe that composes four small ops. This is what a pipeline looks like once it has lived in a system long enough to grow named, reusable parts.

## Files

**Recipes (top-level pipelines):**

- `extract-signal.yaml` — 2 stages. Shell collects, model classifies. Uses `prompt: ./extract-signal.md`.
- `extract-signal.md` — the prompt the recipe calls. About 120 lines, real working prompt.
- `plan.yaml` — 4 stages. Composes the four ops below.

**Ops (atomic stages, called by recipes):**

- `op-locate-ticket.yaml` — pure shell. Globs the vault, returns a path.
- `op-planner.yaml` — model call. Uses `agent: mate-planner` to invoke a Claude Code subagent.
- `op-embed-section.yaml` — pure awk. Splices a content file into another file before a heading marker.
- `op-transition.yaml` — state machine. Mutates frontmatter and appends a Log entry. Every recipe ends with this.

## Reading these alongside

- **"On Owning Your AI Tools"** for the journey and the why. (Link goes here once published.)
- **"Pipelines Over Agents"** for the structural pattern. (Link goes here once published.)

## Background

The shape is older than AI tooling. Ansible playbooks, Kubernetes manifests, CI configs, Makefiles, Just files all share it. [Kestra](https://kestra.io/) sits closest to this folder: its workflow blueprints already include agent stages, and the shape of a Kestra flow looks much like one of these recipes. This folder is what the pattern looks like when applied to one person's day instead of a company's infrastructure.
