---
name: rs-side-project
description: Run the flow for a side project, from its prototype stage to park, stop or invest. Use when a new side project starts, on its second day of work, when it gets a public domain or a post depends on it, when its decision date comes, or when the user says to park, stop or invest in one.
argument-hint: "intake <name> | check | park <name> | stop <name> | invest <name>"
---

# rs-side-project

A prototype is fast work with no process. On its second day it gets an intake: five lines and a
decision date. On that date it is parked, stopped, or invested in. Invest means a restart in the
place where invested work lives, built from what the prototype taught. It is not a repo transfer.

Every place, path and team name comes from the user's config, never from this skill.

## Config

Read `~/.config/rs-side-project/config.yaml` before every run. If it is missing, run first-run setup:
ask the user each field in [references/config-example.yaml](references/config-example.yaml) with the
structured question tool, propose a value where you can read one from the machine (the GitHub user,
the clone folder), and write the file. Never write config values into this skill or its repo.

If `flow_doc` is set, read it before the first run in a session. Where it and this skill disagree,
the flow doc wins.

Each prototype has one record: `<records_dir>/decision-<name>.md`, from
[references/decision-template.md](references/decision-template.md). `<name>` is the repo name.

## intake <name>

Run this on the prototype's second day of work. Run it sooner if the prototype gets a public
domain, a post depends on it, or other people will rely on its facts.

1. Read the repo: README, plans, the last 20 merged PRs, and open handoffs in
   `<handoffs_dir>/<name>/` when that is set.
2. Draft the five lines from what you read: What, Return, Bet, Not now, Signals. Propose a decision
   date at most `decision_weeks` out, and a time budget.
3. Ask the user to confirm Return and Bet with the structured question tool. Put your proposal
   first. The user sets the numbers; do not write a bet they did not confirm.
4. Write the record with `status: prototype`. Then give the decision date in one line.

## check

List every record in `records_dir` whose status is `prototype`. Give one line each: the name, the
decision date, the days left, and what changed since intake (PR count, posts). Flag any record past
its date: it needs park, stop or invest. Flag any repo under `prototype.repos_dir` with more than 2
days of commits and no record.

## park <name>

Park means the prototype stays as it is and keeps working. Nobody builds on it until the user
decides again.

1. **Repo, one PR on the prototype's repo:**
   - The README, from [references/readme-park.md](references/readme-park.md): what it is, its status
     ("prototype, parked on <date>"), what is live, how to run it.
   - `docs/learnings.md`, from [references/learnings-template.md](references/learnings-template.md).
   - Repo files never point to private notes. Write the reasons in the repo's own words.
2. **Record:** set `status: parked`, `parked: <date>`, and `resume_when:` (what would make it worth
   time again). Fold in the open items from its handoffs as a short "Left open" list.
3. **Handoffs:** retire with `retire_cmd` each open handoff about building it. Keep the ones that
   match `keep_handoffs`: they belong to other work. List both groups to the user.
4. **Done log:** when `done_log` is set, add one line, newest first:
   `- <date> · parked · [<name>](<record path>) - <why>. Resume when: <x>.`
5. **Status pages:** if pages in `status_pages` describe it, add one status line saying it is
   parked, with a link to the repo. Fetch the live text and merge before every update.
6. Report what changed, with links. Merging the PR is the user's call.

## stop <name>

Do everything in park, with `status: stopped` and `stopped` in the done log. Then ask the user
before you archive the repo (`gh repo archive`): archiving is outward-facing.

## invest <name>

Invest means the project restarts under `invest.owner`, in a new repo named by
`invest.repo_pattern`. It is not a transfer.

1. Make sure the prototype is parked first: its learnings are the input.
2. Write a restart brief from [references/restart-brief.md](references/restart-brief.md). Cover what
   to keep, what to change (language, repo layout, data shape, site), the first case to rebuild, the
   domain move, and the bet (decision date, keep criteria).
3. Start the work the way `invest.how_to_start` says. A dry run first; the real write only on the
   user's go. New scope is the user's call. Do not create the new repo yourself unless
   `invest.how_to_start` says to.
4. Record: set `status: invested`, `work:` (the link), `restart_repo:`.
5. Once the new site is live, the prototype's README points to the new home. Then run `stop`.

Transfer the old repo instead of restarting only when the user says its code is what they would
write again. Say that trade-off when you ask.

## Rules

- A prototype gets none of what `invest.not_before` lists (team tickets, wiki pages of its own,
  repos under the invest owner, agent review). Posts about it are fine.
- Do not build structure (orgs, wiki trees, domains, docs sites) before the intake exists.
- Pushing a branch and opening a PR need no confirmation. Merges, archives, new work items and pages
  that people read are the user's call.
