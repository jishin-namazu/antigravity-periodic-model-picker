---
name: antigravity-periodic-model-picker
description: Install, update, configure, verify, or uninstall the Antigravity Periodic Model Picker panel.
---

# Antigravity Periodic Model Picker (v1.0)

Replaces the expanded model dropdown in Antigravity Desktop with a 118-element periodic table selector, with theme sync, thinking effort switching, quota view, and custom element mappings.

## Directory Layout

Default plugin path: `~/.gemini/config/plugins/periodic-model-picker/` (`%USERPROFILE%\.gemini\config\plugins\periodic-model-picker\` on Windows).

```text
antigravity-periodic-model-picker/
├── plugin.json                 # Plugin manifest
├── install.mjs                 # CLI (doctor / install / verify / rollback / uninstall / pack)
├── SKILL.md                    # Agent installation and configuration guide
├── README.md                   # English documentation
├── README.zh-CN.md             # Chinese documentation
├── assets/                     # Logo and screenshot
├── skills/periodic-model-picker/SKILL.md
├── core/                       # Core runtime (SHA-256 verified via manifest.json)
│   ├── manifest.json
│   ├── daemon.mjs
│   ├── runtime.js
│   └── periodic.css
├── user/                       # User configuration (auto-reloads on save, preserved on update)
│   ├── config.json
│   ├── custom.css
│   └── custom.js
└── preview/index.html          # Local preview page
```

## Installation & Update

Requires **Node.js >= 22.0.0**.

If the project is not yet inside `~/.gemini/config/plugins/periodic-model-picker/` (`%USERPROFILE%\.gemini\config\plugins\periodic-model-picker\` on Windows), clone or copy it there first, then run:

```bash
node install.mjs doctor
node install.mjs install
node install.mjs verify
```

`verify` outputs `"ok": true` and `"pickerReady": true` once active.

## Configuration (`user/config.json`)

```json
{
  "enabled": true,
  "channel": "auto",
  "periodicTheme": "auto",
  "closeOnSelect": "effort",
  "shortcut": "Alt+M",
  "defaultSeedElements": ["Hydrogen", "Carbon", "Neon", "Argon"],
  "defaultSeedOtherModels": [],
  "modules": {
    "periodicPicker": true,
    "keyboardShortcut": true,
    "customCss": true,
    "customJs": true
  },
  "customElementMappings": {
    "Claude Opus": "Au",
    "Claude Sonnet": "Ag"
  },
  "extraOtherModels": []
}
```

- `periodicTheme`: `"auto"` | `"dark"` | `"light"`
- `closeOnSelect`: `"effort"` (default: click model to lock, then click effort to apply and close) | `"model"` (close immediately on model click)
- `customElementMappings`: Map model name substrings to an element (`Z` number, symbol, or element name)
- Hold `Alt` while clicking the model button to open the default menu

## Troubleshooting, Rollback & Uninstall

```bash
node install.mjs verify --safe-mode
node install.mjs rollback
node install.mjs uninstall
```
