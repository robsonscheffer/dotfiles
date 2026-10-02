# claims.yaml reference

The ledger sits next to the pages, one per doc folder. The schema lives at `schema/claims.schema.json` in the rs-mate-doc skill folder; `mate-doc lint` validates against it.

```yaml
author: human:Alex              # who wrote the ledger; `mate-doc new` fills it
claims:
  - id: C1                     # C<number>, referenced in prose as {C1}
    claim: <the fact, worded like the page sentence>
    status: proposed | inferred | verified | not_verified
    evidence: { ... }          # required except for not_verified
    ttl_days: 30               # after this many days the claim is stale
    owner: <person>            # required for not_verified; a real name, never TODO
    # written by `mate-doc verify` or a human, never by the author:
    verdict: supports          # supports | overstates | contradicts | unrelated | uncheckable
    verdict_reason: <one line from the verifier>
    verdict_hash: <hash of claim and evidence when judged>
    checked_by: verifier:claude-sonnet-x   # verifier:<model> or human:<name>
    checked_at: 2026-09-25
```

The author writes `proposed` with only `evidence` and `ttl_days`. `verify` moves it to `verified` on `supports`. A gate pass needs `checked_by` to start with `verifier:` or `human:` and differ from `author`.

Use `inferred` when the evidence exists but the sentence is a reasonable reading of it rather than a quote (for example, "this runs on every deploy" read from a CI config). It needs evidence like `verified` does.

## Evidence kinds

Every evidence block has `kind` and `needs` (the capability used to re-check it: `git`, `gh`, `http`, `snow`, or `mcp:<name>`).

### code

```yaml
evidence:
  kind: code
  ref: acme/widgets@main:config/mise.toml:3
  excerpt: 'bun = "1.4.2"'
  needs: gh
```

- `ref` is `owner/repo@<rev>:<path>:<line>`. The repo is always explicit; audit never guesses from the current directory.
- The check passes when `excerpt` appears within 3 lines of `<line>` at `<rev>`.
- Audit uses a local checkout when `~/.config/mate-doc/config.yaml` maps the repo under `repos:`, otherwise `gh api`. `needs: gh` is the safe default for anything on GitHub.
- Read the file at that revision before writing the claim and copy the excerpt exactly, including quotes. Prefer `git show <rev>:<path>` from inside a local checkout (run `git log -1 <rev>` first to confirm the rev exists there). Without a checkout, `gh api repos/<owner>/<repo>/contents/<path>?ref=<rev> --jq .content | base64 -d` works but asks the user first: the skill does not pre-approve `gh api`, because the same command can write.

### link

```yaml
evidence:
  kind: link
  url: https://docs.example.com/page
  excerpt: "the phrase that must be on the page"
  needs: http
```

Passes when the URL returns 200 and contains the excerpt. Use `needs: gh` with a GitHub URL when the page needs auth.

### query

```yaml
evidence:
  kind: query
  sql: queries/c2-orders.sql     # path relative to the doc folder
  expect: { rows: 1, value: 312, tolerance: 0 }
  needs: snow
```

Only when a warehouse capability is configured. If it is not, audit reports `capability-missing` and the gate fails; downgrade the claim to not_verified with an owner instead.

### record

```yaml
evidence:
  kind: record
  ref: <record id the adapter understands>
  field: status
  expect: Done
  needs: mcp:jira
```

### mcp

```yaml
evidence:
  kind: mcp
  source: mcp:jira:ABC-12
  excerpt: "text from the source"
  needs: mcp:jira
```

Neither audit nor `verify` can fetch MCP sources. `verify` reports "needs a human verdict", and the claim passes the gate only with a `human:` verdict (`mate-doc verdict ... --supports`, run by a person).

## Choosing ttl_days

Match it to how fast the fact can change:

| Fact | ttl_days |
| --- | --- |
| Code on a release branch or a SHA | 90 |
| Code on main | 30 |
| Docs pages, configs | 30 |
| Metrics, counts, dashboards | 7 |
| Anything someone told you in chat | not_verified with them as owner |

## Gate reasons and what to do

| Reason | Fix |
| --- | --- |
| `lint` | run `mate-doc lint`, fix what it names |
| `no-verdict` | run `mate-doc verify <folder>` |
| `verdict-not-supports` | read `verdict_reason`, fix the sentence or the evidence, re-run `verify` |
| `no-author` | set a real `author:` in the ledger (`mate-doc new` fills it) |
| `verdict-not-independent` | the author or an agent gave the verdict: remove it and run `verify` |
| `verdict-stale` | the claim or evidence changed after the verdict: re-run `verify` |
| `mcp-needs-human` | The user runs `mate-doc verdict ... --supports` at their terminal |
| `stale` | re-read the source, update excerpt or line, re-run `verify` |
| `check-failed` | the excerpt moved or changed: find it again, or the fact is no longer true |
| `capability-missing` | the machine cannot run that check; pick another evidence kind or downgrade |
| `no-owner` | name a real owner for the not_verified claim |

An integrity reason (`no-author`, `verdict-not-independent`, `verdict-stale`, `mcp-needs-human`) demotes an `official` doc to `draft`.

## Lint rules for claims

| Rule | Fix |
| --- | --- |
| `claim-is-instruction` | the claim reads as advice or a reading direction: rewrite it as a checkable fact, or drop the `{Cn}` ref |
| `weak-excerpt` | excerpt under 8 characters or without real words: copy a longer exact line |
| `excerpt-local-ref` | excerpt names a fetch file such as `diff.patch:12`: cite the source file and line |
| `verified-without-verdict` | a `verified` claim has no verdict: set it back to `proposed` and run `verify` |
