#!/usr/bin/env bash
# Bootstrap script for dotfiles — idempotent, safe to re-run.
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Dotfiles bootstrap: $DOTFILES_DIR"

# --- Homebrew ---
if ! command -v brew &>/dev/null; then
  echo "==> Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# --- Brewfile ---
echo "==> Installing Homebrew packages..."
brew bundle --file="$DOTFILES_DIR/Brewfile" --no-lock

# --- Chezmoi ---
if ! command -v chezmoi &>/dev/null; then
  echo "==> Installing chezmoi..."
  brew install chezmoi
fi

# --- Git hooks ---
echo "==> Configuring git hooks..."
git -C "$DOTFILES_DIR" config core.hooksPath .githooks

# --- Apply dotfiles ---
echo "==> Applying dotfiles with chezmoi..."
chezmoi init --source "$DOTFILES_DIR/home" --apply

echo "==> Done! Restart your shell or run: source ~/.zshrc"
