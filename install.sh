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
brew bundle --file="$DOTFILES_DIR/Brewfile"

# --- Chezmoi ---
if ! command -v chezmoi &>/dev/null; then
  echo "==> Installing chezmoi..."
  brew install chezmoi
fi

# --- Worktrunk shell integration ---
if command -v wt &>/dev/null; then
  echo "==> Configuring worktrunk shell integration..."
  wt config shell install
fi

# --- Git hooks ---
echo "==> Configuring git hooks..."
git -C "$DOTFILES_DIR" config core.hooksPath .githooks

# --- Chezmoi source symlink ---
# chezmoi expects source at ~/.local/share/chezmoi by default.
# Symlink it to our actual source dir so all chezmoi commands work without --source.
CHEZMOI_DEFAULT="$HOME/.local/share/chezmoi"
if [ ! -L "$CHEZMOI_DEFAULT" ] || [ "$(readlink "$CHEZMOI_DEFAULT")" != "$DOTFILES_DIR/home" ]; then
  echo "==> Symlinking chezmoi source dir..."
  mkdir -p "$(dirname "$CHEZMOI_DEFAULT")"
  rm -rf "$CHEZMOI_DEFAULT"
  ln -s "$DOTFILES_DIR/home" "$CHEZMOI_DEFAULT"
fi

# --- Apply dotfiles ---
echo "==> Applying dotfiles with chezmoi..."
chezmoi init --apply

echo "==> Done! Restart your shell or run: source ~/.zshrc"
 
