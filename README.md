# Sidebar Swipe Switcher

Obsidian plugin for switching left and right sidebar tabs with horizontal touchpad swipes.

## Features

- Detects horizontal swipe-like wheel gestures while the pointer is over the left or right sidebar
- Switches to the next or previous tab in that sidebar
- Adds command palette commands for cycling each sidebar manually
- Exposes settings for swipe threshold, cooldown, and direction inversion

## Default Behavior

Fresh installs start with these defaults:

- `swipeThreshold: 40`
- `cooldownMs: 300`
- `invertDirection: true`

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` if present from the latest release or build output.
2. Create a folder named `sidebar-swipe-switcher` inside your vault's `.obsidian/plugins/` directory.
3. Copy the plugin files into that folder.
4. Enable **Sidebar Swipe Switcher** in Obsidian community plugin settings.

### Development

```bash
npm install
npm run build
```

For live rebuilding during development:

```bash
npm run dev
```

## Notes

- Built and tested against Obsidian `1.12.7`
- Desktop only
- The plugin relies on current Obsidian sidebar runtime objects, so future Obsidian UI internals may require small adjustments
