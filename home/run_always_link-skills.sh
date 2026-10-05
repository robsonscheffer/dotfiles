#!/usr/bin/env bash
# chezmoi run_always: make every skill in ~/.claude/skills visible to the other harnesses.
# ~/.claude/skills is the one real copy (dotfiles, Paperclip and mate install there).
# ~/.agents/skills (pi, opencode) and ~/.codex/skills (Codex) hold only symlinks to it.
set -euo pipefail

src="$HOME/.claude/skills"
[[ -d "$src" ]] || { echo "link-skills: skipping, $src not found"; exit 0; }

for dir in "$HOME/.agents/skills" "$HOME/.codex/skills"; do
  [[ -d "$(dirname "$dir")" ]] || continue
  mkdir -p "$dir"

  # Drop links into ~/.claude/skills whose target is gone.
  for link in "$dir"/*; do
    [[ -L "$link" ]] || continue
    target=$(readlink "$link")
    if [[ "$target" == "$src/"* && ! -e "$link" ]]; then
      rm "$link"
      echo "link-skills: removed dangling $link"
    fi
  done

  for skill in "$src"/*/; do
    name=$(basename "$skill")
    dst="$dir/$name"
    if [[ -L "$dst" ]]; then
      [[ "$(readlink "$dst")" == "$src/$name" ]] || echo "link-skills: $dst points elsewhere, left as is"
    elif [[ -e "$dst" ]]; then
      echo "link-skills: $dst is a real copy, not replaced; move it away to link it"
    else
      ln -s "$src/$name" "$dst"
      echo "link-skills: linked $dst"
    fi
  done
done
