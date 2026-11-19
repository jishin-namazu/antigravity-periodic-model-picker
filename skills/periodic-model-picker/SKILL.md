---
name: periodic-model-picker
description: Install, configure, verify, or uninstall the Antigravity Periodic Model Picker panel and manage custom element mappings.
---

# Periodic Model Picker Skill

Run commands from the plugin root (`~/.gemini/config/plugins/periodic-model-picker/`):

1. **Check environment**:
   ```bash
   node install.mjs doctor
   ```
2. **Install & verify**:
   ```bash
   node install.mjs install
   node install.mjs verify
   ```
3. **Safe mode, rollback, or uninstall**:
   ```bash
   node install.mjs verify --safe-mode
   node install.mjs rollback
   node install.mjs uninstall
   ```

## Configuration

- `core/manifest.json` checks SHA-256 hashes for files under `core/`; put customizations in `user/` instead.
- Edit `~/.gemini/config/plugins/periodic-model-picker/user/config.json` to change theme, shortcut, `closeOnSelect`, or `customElementMappings` (reloads automatically on save).
