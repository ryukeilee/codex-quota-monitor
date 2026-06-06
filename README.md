# Codex Monitor

Codex Monitor is a privacy-first, local macOS menu bar application for monitoring Codex usage and quota status.

[中文版说明](./readme-zh.md)

## Overview

- Local-first Electron desktop application
- Live quota reads from the local Codex app-server
- Weekly quota retained in the interface
- Menu bar percentage display with a low-quota warning state
- Compact mini stats panel
- Auto-launch support
- Pure menu bar mode with the Dock hidden
- Low-frequency refresh strategy
- Local SQLite persistence for application state
- Usage history chart and prediction hints

## Quick Start

```bash
npm install
npm test
npm start
```

You can also launch the application by double-clicking [run.command](./run.command).

## Data Sources

The application prefers live local quota data from the Codex app-server and falls back to local snapshots when needed.

Source priority:

1. Live `account/rateLimits/read` data from the local Codex app-server
2. Local snapshot fallback in `data/source-snapshot.json`

The live source provides:

- 5-hour quota remaining percentage
- Weekly quota remaining percentage
- Reset timestamps

The fallback snapshot format is intentionally simple:

```json
{
  "sourceLabel": "demo-local-snapshot",
  "limit": 100,
  "isActive": true,
  "isHighIntensity": false,
  "records": [
    {
      "at": "2026-06-06T01:10:00.000Z",
      "amount": 8,
      "model": "gpt-5.4",
      "intensity": "medium"
    }
  ]
}
```

## System Tray

- Displays the current 5-hour remaining percentage in the menu bar title
- Displays the weekly remaining percentage in the tray menu
- Shows a warning symbol when the 5-hour window is close to the limit
- Lets you toggle the main window, mini panel, notifications, and menu bar display

## Privacy and Storage

- No browser session is required
- No Chrome dependency is needed
- The app reads local Codex state only
- Runtime data and logs are kept out of version control
- Local artifacts under `data/`, `logs/`, `.playwright-mcp/`, and other generated files are intended to remain untracked

## Chinese Documentation

For the full Chinese version, see [readme-zh.md](./readme-zh.md).
