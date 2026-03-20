---
name: bamboo-usage
description: Use when interacting with Bamboo CI — checking build status, investigating build failures, querying build history, or understanding Bamboo plan structure. Use when the user says "check the build", "why is CI failing", "get build logs", "check Bamboo", "what's the build status", or when any workflow needs Bamboo build data.
allowed-tools: mcp__bamboo__get_build, mcp__bamboo__get_recent_builds
---

# Working with Bamboo CI

## Overview

Reference guide for interacting with Bamboo CI via MCP tools. Covers build inspection, failure investigation, and integration with other workflows.

**Critical pattern:** Bamboo MCP responses are extremely verbose. **Always delegate Bamboo MCP calls to sub-agents** using the Task tool to avoid filling up context.

## MCP Tools

### mcp__bamboo__get_recent_builds

Fetch recent builds for a plan. Returns build keys, status, VCS revisions, and timestamps.

```
mcp__bamboo__get_recent_builds(plan_key="AT-ATK", limit=10)
```

### mcp__bamboo__get_build

Fetch details for a specific build. Returns status, VCS revision, failed test names, and logs.

```
mcp__bamboo__get_build(build_key="AT-ATK-12345")
```

## Known Plan Keys

| Plan Key | Purpose |
|----------|---------|
| `AT-ATK` | Main test suite (app tests) |
| `SD-K8S` | Staging deployment (k8s) |

## Sub-Agent Pattern (REQUIRED)

Bamboo responses can be 10k+ tokens. **Never call Bamboo MCP tools directly from the main agent.** Always use a sub-agent:

```
Use the Task tool (subagent_type="generalPurpose") with a prompt like:
"Call mcp__bamboo__get_recent_builds with plan_key 'AT-ATK' and limit 10.
Return ONLY: a list of build keys, their status (pass/fail), and the VCS revision SHA for each."
```

For build details:

```
Use the Task tool (subagent_type="generalPurpose") with a prompt like:
"Call mcp__bamboo__get_build with build_key 'AT-ATK-12345'.
Return ONLY: build status, VCS revision SHA, failed test names (if any), and a 1-line summary of the failure."
```

**Always specify what to return** — without this, the sub-agent will dump the entire response.

## Common Workflows

### Check Build Status for a Branch

1. Get recent builds for the plan via sub-agent
2. Match builds to your branch's VCS revision:
   ```bash
   git rev-parse HEAD  # get current SHA
   ```
3. Find the build with matching revision in the sub-agent results

### Investigate a CI Failure

1. Get recent builds via sub-agent — identify the failing build key
2. Get build details via sub-agent — extract failed test names and error summary
3. Classify the failure:

| Failure Pattern | Next Step |
|----------------|-----------|
| Test failures (specific test names) | Run locally: `bundle exec m test/path:LINE` |
| Lint/style failures | Run linter: `bundle exec rubocop` |
| Build/compile errors | Check error message, fix source |
| Policy checks | Usually stale branch — try rebase |
| Timeout/infrastructure | Retry or check Bamboo server health |

### Find When a Test Started Failing

Use binary search through build history:

1. Get last 20 builds via sub-agent
2. Find the boundary: last passing build and first failing build
3. Extract VCS SHAs for both
4. Use for `git bisect` (see `diagnose-test-regression` skill for full workflow)

### Check Deploy Status

For staging deploys (`SD-K8S` plan):

1. Get recent builds for `SD-K8S` via sub-agent
2. Look for your branch name in the build results
3. Check build status: successful = deployed, failed = check logs

## Bamboo Branch Naming

Bamboo replaces `/` with `-` in branch names:

```
Git branch:    user/PROJ-123-feature
Bamboo branch: user-PROJ-123-feature
```

When searching for a branch in Bamboo, convert the format first.

## Bamboo URLs

| Resource | URL Pattern |
|----------|-------------|
| Base URL | `https://ci.example.com/bamboo` |
| Plan browse | `{base}/browse/{PLAN_KEY}` |
| Build result | `{base}/browse/{BUILD_KEY}` |
| Branch search | `{base}/browse/{PLAN_KEY}?searchTerm={BRANCH}` |

## Related Skills

- `diagnose-test-regression` — full bisect workflow for deterministic test failures
- `deploy-branch` — deploy a branch to staging via Bamboo
- `fix-pr` — fix CI failures on a pull request
