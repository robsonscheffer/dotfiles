# Robson's Dotfiles: Refactoring and Automation Plan

This document outlines the plan to build a secure, context-aware, and automated development environment based on the `ivy/dotfiles` philosophy.

### **CRITICAL: Security First**

The current `.zshrc` contains hardcoded API keys. Before making this repository public or fully implementing this plan, all secrets **must** be moved to a dedicated secret manager like 1Password, Bitwarden, or the native macOS Keychain.

The refactoring plan below will use `chezmoi`'s secret management features to securely load these keys into the environment.

---

## The Refactoring Plan

### 1. Shell Configuration (`.zshrc`)

The goal is to separate universal settings, work-specific settings, and secrets.

- **`home/dot_zshrc.tmpl`**: This will be the main, universal shell configuration file.
  - It will contain the setup for Oh My Zsh, Powerlevel10k, and universal aliases.
  - All secret `export` statements will be replaced with `chezmoi` secret-loading functions, for example:
    ```bash
    # Securely load OpenAI API Key from 1Password
    export OPENAI_API_KEY="{{ onepasswordRead "op://private/openai/api-key" }}"
    ```
  - A conditional block will be added at the end to load work-specific configurations only when the `gusto` context is active:
    ```bash
    # Load work-specific settings only when in the 'gusto' context
    {{ if eq .chezmoi.context "gusto" -}}
    if [ -f ~/.zshrc-work ]; then
      source ~/.zshrc-work
    fi
    {{- end }}
    ```

- **`home/dot_zshrc-work`**: A new, separate file for Gusto-specific settings.
  - It will contain all work-related aliases (`dbclean`, `resetgenesis`, `js`, `api`, etc.) and non-secret environment variables.
  - This file will only be created on the filesystem when the `gusto` context is applied.

### 2. Editor Configuration (`settings.json`)

This will allow for different editor settings between personal and work projects.

- **`home/Library/Application Support/Antigravity/User/settings.json.tmpl`**:
  - We will start by using the existing `settings.json` as the base template.
  - We can add context-aware logic as needed. For example, to use a different theme for work:
    ```json
    {
      "workbench.colorTheme": {{ if eq .chezmoi.context "gusto" }}"Abyss"{{ else }}"Dracula Theme"{{ end }}
    }
    ```

### 3. SSH Configuration (`.ssh/config`)

This will manage different SSH keys for personal and work identities securely.

- **`home/private_dot_ssh/config.tmpl`**:
  - The `private_` prefix ensures `chezmoi` sets file permissions to `600`.
  - The template will define different hosts and `IdentityFile` paths based on the active context.
    ```ini
    # Personal GitHub Account
    Host github.com
      HostName github.com
      User git
      IdentityFile ~/.ssh/github_personal_id_ed25519

    # Work-specific Git host (only added in 'gusto' context)
    {{ if eq .chezmoi.context "gusto" -}}
    Host gitlab.gusto.com
      HostName gitlab.gusto.com
      User git
      IdentityFile ~/.ssh/gusto_work_id_ed25519
    {{- end }}
    ```

## Next Steps

1.  **Secure Secrets:** Move all API keys from `.zshrc` into a chosen secret manager.
2.  **Implement Templates:** Create the new `.tmpl` files as described above.
3.  **Set up Renovate:** Add a `renovate.json5` file to automate dependency updates.
4.  **Add CI Self-Testing:** Create a GitHub Actions workflow to test changes to the dotfiles.
