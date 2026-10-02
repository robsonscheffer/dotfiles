---
name: rs-copy
description: Copy content to my clipboard using `pbcopy`.
argument-hint: "[content | file path | last response]"
disable-model-invocation: true
allowed-tools:
  - Bash(pbcopy:*)
  - Bash(slackcopy:*)
  - Read
---

# Copy to Clipboard

## Arguments

```
$ARGUMENTS
```

## Instructions

### No Arguments / "last response"

Copy Claude's last response to the clipboard.

### File Path

If arguments look like a file path (starts with `/`, `~`, `./`, or contains a known extension):

1. Read the file with the Read tool
2. Pipe contents to `pbcopy`

### Literal Content

Copy the provided text directly to clipboard.

### Slack

If the user asks to copy for Slack (or rich text, bold, bullets, links), pipe markdown into `slackcopy`
instead of `pbcopy`. It writes `public.html` plus plain text, so Slack pastes bold, bullets, and
clickable links. Use `slackcopy --html` for raw HTML.

```bash
slackcopy << 'EOF'
[markdown to copy]
EOF
```

## Implementation

```bash
pbcopy << 'EOF'
[content to copy]
EOF
```

## Examples

```
/copy                     → copy last response
/copy last response       → copy last response
/copy ~/notes.txt         → copy file contents
/copy Hello, world!       → copy literal text
/copy for Slack           → copy last response as rich text via slackcopy
```
