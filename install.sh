#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
# Add any other core dependencies here if needed
CORE_DEPS=("git" "ansible" "chezmoi" "mise")

# --- Colors for logging ---
RST=$'\033[0m' BOLD=$'\033[1m'
CYAN=$'\033[36m' GREEN=$'\033[32m' RED=$'\033[31m' YELLOW=$'\033[33m'

log_info() {
  printf "%s%s[INFO]%s %s\n" "$BOLD" "$CYAN" "$RST" "$1"
}

log_success() {
  printf "%s%s[SUCCESS]%s %s\n" "$BOLD" "$GREEN" "$RST" "$1"
}

log_error() {
  printf "%s%s[ERROR]%s %s\n" "$BOLD" "$RED" "$RST" "$1" >&2
}

# --- Main Functions ---

check_dependencies() {
  log_info "Checking for core dependencies..."
  for dep in "${CORE_DEPS[@]}"; do
    if ! command -v "$dep" &> /dev/null; then
      log_error "Dependency not found: '$dep'. Please install it."
      if [[ "$dep" == "ansible" ]]; then
        echo "  Try: python3 -m pip install --user ansible"
      elif [[ "$dep" == "chezmoi" || "$dep" == "mise" ]]; then
        echo "  Try installing with Homebrew: brew install $dep"
      fi
      exit 1
    fi
  done
  log_success "All core dependencies are present."
}

run_ansible_playbook() {
  log_info "Running Ansible playbook to install GUI applications..."
  if ansible-playbook ansible/playbook.yml; then
    log_success "Ansible playbook completed successfully."
  else
    log_error "Ansible playbook failed."
    exit 1
  fi
}

apply_chezmoi() {
  log_info "Applying dotfiles with chezmoi..."
  log_info "This will trigger mise to install all your CLI tools."

  # Determine context (default to personal, check for 'gusto' hostname pattern)
  CONTEXT="personal"
  if [[ "$(hostname)" == *"gusto"* ]]; then
      CONTEXT="gusto"
  fi
  
  log_info "Using context: $CONTEXT"

  if chezmoi apply --context "$CONTEXT"; then
    log_success "Dotfiles applied and CLI tools installed."
  else
    log_error "chezmoi apply failed."
    exit 1
  fi
}

main() {
  # Ensure the script is run from the dotfiles directory
  if [ ! -f "chezmoi.toml" ]; then
      log_error "This script must be run from the root of the dotfiles repository."
      exit 1
  fi

  check_dependencies
  run_ansible_playbook
  apply_chezmoi

  log_success "🚀 Your environment is ready!"
}

main "$@"
