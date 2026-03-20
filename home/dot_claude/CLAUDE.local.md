# Personal Instructions

## Codebase Navigation

- **Subsystem tests live inside subsystems.** When looking for feature tests, always check `subsystems/{subsystem}/test/features/` first, not just the top-level `test/features/` directory. Each subsystem owns its own tests.

## Ruby/Rails

- Find a gem: `bundle info <gem>` or `bundle show <gem>`
- Find where a method is defined: `Grep` for `def method_name`
- Find a class: `Glob` for `**/<class_name_snake_case>.rb`
- Check routes: `bundle exec rails routes -g <pattern>`
- Check DB schema: read `db/structure.sql` or `db/schema.rb`

## Environment Setup

- **Do not run `mise trust` unprompted.** Mise config files in worktrees are already trusted by the user. If mise shows a trust warning, ignore it — the user will handle it. Don't try to fix the environment automatically.
- **Never append `2>&1` or `2>/dev/null` to commands.** These stderr redirects trigger permission prompts. Just run the command plain — stderr shows in the output anyway.
