# Security Audit: approve-safe-commands hook

Last reviewed: 2025-02-07

## Overall Assessment

The hook is well-architected with genuine defense-in-depth. The AST-based approach using shfmt is a strong foundation — it correctly handles quoting, escaping, and structural parsing that regex-based approaches would miss. The fail-safe default (unapproved = user prompted, not denied) means any bypass only results in an unnecessary prompt, not a blocked command. The stress test suite is thorough and covers the most common attack categories.

## Findings

### 1. ~~`git` safe subcommands allow destructive sub-operations~~ (Fixed)

**Status: Resolved**

Added compound `dangerous_flags` keys (`"git branch"`, `"git stash"`, etc.) that block destructive flags/args per-subcommand.

### 2. `find` has file-writing flags not in `dangerous_flags`

**Risk: Low** — Claude Code uses shell redirects (which are blocked) or the Write tool for file output, not obscure find flags.

### 3. `awk -f` and `sed -f` bypass argument pattern checks

**Risk: Low** — Requires a two-step attack: create a malicious file (requires user approval), then run it. Claude Code inlines programs directly.

### 4. `shfmt -w` can modify files in-place

**Risk: Very Low** — Claude Code uses the Edit tool for file modifications.

### 5. `date` can theoretically set system time

**Risk: Negligible** — Requires root privileges.

### 6. Unicode direction override visual spoofing

**Risk: Informational** — Already documented as a known limitation.

## Positive Findings

1. **AST-level structural checks are robust**: CmdSubst, ProcSubst, ParamExp, ArithmExp, and ExtGlob are caught globally.
2. **ANSI-C quoting block is correctly implemented**: Catches all `$'...'` patterns.
3. **Combined short flag detection is thorough**: `-ni`, `-in`, `-ani` all correctly detect dangerous `-i` flag.
4. **Pipeline write isolation is well-enforced**: Both sides of BinaryCmd nodes are recursively validated.
5. **Fail-safe on parse failure**: Unparseable commands result in user prompt, not auto-approval.
6. **Cost-ordered validation**: Cheap regex fast path before shfmt subprocess.
7. **sed `e` command coverage is thorough**: Standalone `e`, addressed `e`, and `s///e` flag are all caught.
