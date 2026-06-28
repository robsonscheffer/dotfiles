---
name: rs-agent-ssh-key
description: Use when Claude Code background agents fail to commit or push due to SSH signing errors, 1Password being locked, or laptop screen lock breaking git operations. Also use for first-time machine setup of the worker signing key.
argument-hint: "[setup | check]"
allowed-tools:
  - AskUserQuestion
  - Bash(git config:*)
  - Bash(ssh-add:*)
  - Bash(ssh-keygen:*)
  - Bash(ssh -T:*)
  - Bash(gh api:*)
  - Bash(jq:*)
  - Read(~/.claude/settings.json)
  - Read(~/.gitconfig.d/*)
---

# Agent SSH Key

Keeps Claude Code worker sessions signing commits via macOS Keychain — not 1Password.
Keychain survives laptop lock. 1Password does not.

**Pattern:** role-scoped agent git identity. Dedicated key at
`~/.ssh/agents/work/id_ed25519`, gitconfig at `~/.gitconfig.d/claude-agent-work`,
`gpg.ssh.program = ssh-keygen` (bypasses `op-ssh-sign` entirely).

## Arguments

| Argument | Action                                   |
| -------- | ---------------------------------------- |
| `setup`  | Confirm email + key path, then run setup |
| `check`  | Verify current state                     |
| _(none)_ | Diagnose a failure and suggest fix       |

## Setup Flow

**Step 1 — Discover defaults**

```bash
git config user.email        # e.g. you@company.com
ls ~/.ssh/agents/work/ 2>/dev/null || echo "no key yet"
```

**Step 2 — Confirm with AskUserQuestion**

Use `AskUserQuestion` with two questions:

1. Agent email — propose the `+agent` variant of the discovered email (e.g. `you+agent@company.com`). Ask to confirm or override.
2. Key path — propose `~/.ssh/agents/work/id_ed25519`. Ask to confirm or override.

**Step 3 — Run the script**

```bash
~/.claude/skills/rs-agent-ssh-key/bin/setup-agent-ssh-key \
  --email "CONFIRMED_EMAIL" \
  --key-path "CONFIRMED_KEY_PATH"
```

**Step 4 — Remind manual steps**

Tell the user:

1. Add the confirmed agent email as a verified address on GitHub → https://github.com/settings/emails
2. Authorize SSO for your GitHub orgs on the new signing key

## Health Check

```bash
# Key is loaded
ssh-add -l | grep agents/work

# Gitconfig resolves correctly
GIT_CONFIG_GLOBAL=~/.gitconfig.d/claude-agent-work git config --list \
  | grep -E 'user\.(name|email|signingkey)|gpg|commit'

# GitHub auth works with the agent key
ssh -T git@github.com 2>&1

# Test signing directly — no 1Password prompt should appear
echo "test" | ssh-keygen -Y sign -n git \
  -f ~/.ssh/agents/work/id_ed25519.pub -q && echo "signing works"
```

## After a Reboot

The key reloads automatically via `ssh-add --apple-load-keychain` in `~/.zshrc`.
If a new shell hasn't run yet:

```bash
ssh-add --apple-load-keychain
```

## How It Works

`~/.claude/settings.json` sets `GIT_CONFIG_GLOBAL=~/.gitconfig.d/claude-agent-work`
for every Claude Code session. That file uses `gpg.ssh.program = ssh-keygen`, which
calls the macOS ssh-agent directly — 1Password is never consulted.

Interactive git sessions are unaffected: they still use `~/.gitconfig` with
`op-ssh-sign` and the main key.

## Troubleshooting

**`sign_and_send_pubkey: signing failed: agent refused operation`**
→ Key not loaded. Run `ssh-add --apple-load-keychain`.

**`error: gpg failed to sign the data`**
→ `GIT_CONFIG_GLOBAL` not set. Check `~/.claude/settings.json`, re-run setup.

**1Password dialog appearing during agent commits**
→ `gpg.ssh.program` is still `op-ssh-sign`. Check `~/.gitconfig.d/claude-agent-work`
was written and `GIT_CONFIG_GLOBAL` points to it.

**`Permission denied (publickey)` on push**
→ Auth key not registered or SSO not authorized.
`gh api user/keys --jq '.[].title'` to check registration.
