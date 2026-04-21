# Sidebar Swipe Switcher

Obsidian plugin for switching left and right sidebar tabs with horizontal touchpad swipes.

## Features

- Detects horizontal swipe-like wheel gestures while the pointer is over the left or right sidebar
- Switches to the next or previous tab in that sidebar
- Adds command palette commands for cycling each sidebar manually
- Supports normal Obsidian hotkey bindings through those commands
- Exposes settings for swipe threshold, cooldown, and direction inversion

## Installation

### BRAT
Use BRAT plugin

### Manual

1. Download `main.js` and `manifest.json` from the latest release or build output.
2. Create a folder named `sidebar-swipe-switcher` inside your vault's `.obsidian/plugins/` directory.
3. Copy the plugin files into that folder.
4. Enable **Sidebar Swipe Switcher** in Obsidian community plugin settings.

## Hotkeys

The plugin registers these commands, so you can bind them in `Settings -> Hotkeys`:

- `Sidebar Swipe Switcher: Next left sidebar tab`
- `Sidebar Swipe Switcher: Previous left sidebar tab`
- `Sidebar Swipe Switcher: Next right sidebar tab`
- `Sidebar Swipe Switcher: Previous right sidebar tab`

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
