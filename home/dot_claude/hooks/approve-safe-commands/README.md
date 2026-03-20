# approve-safe-commands

A Claude Code PreToolUse hook that auto-approves safe Bash commands for autonomous execution.

Uses `shfmt` to parse commands into an AST and validates them against configurable allowlists — read-only commands by default, with opt-in support for a curated set of write commands. Commands that don't pass are **not denied** — the user is prompted as usual.

## Dependencies

```bash
brew install shfmt
```

## Configuration

Defaults are in `config.default.json`. Override any settings in `config.json` (same directory). User config is deep-merged on top of defaults — hashes are recursively merged, arrays are appended (deduplicated), and scalars are replaced.

## Running Tests

```bash
ruby hook_test.rb       # unit tests
ruby stress_test.rb     # adversarial/security tests
```

## Benchmarking

```bash
ruby benchmark.rb              # full suite, 50 iterations per command
ruby benchmark.rb --quick      # 10 iterations, faster feedback
ruby benchmark.rb --category fast_path   # single category
```

## Debugging

```bash
DEBUG=1 echo '{"tool_input":{"command":"ls -la"}}' | ruby hook.rb
```
