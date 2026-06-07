# Codex Monitor

Codex Monitor is a privacy-first, local macOS menu bar application for monitoring Codex usage and quota status.

[中文版说明](./readme-zh.md)

## Overview

- Local-first Electron desktop application
- Live quota reads from the local Codex app-server
- Weekly quota prioritized in the menu bar title
- Last refresh and reset timing surfaced in the tray menu
- Weekly reset timing, flow prediction, and development state mirrored in the main window and mini panel
- Compact mini stats panel
- Auto-launch support
- Pure menu bar mode with the Dock hidden
- Low-frequency refresh strategy with a 5-minute default timer, wake retries, and forced refresh deduping
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

The 5-hour window display prefers the live `individualLimit.remainingPercent` field from `account/rateLimits/read`, with the older `primary.usedPercent` shape kept as a fallback for compatibility.

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

- Displays the weekly remaining percentage in the menu bar title as a plain native-style percentage
- Shows Chinese tray labels for `Weekly Quota`, `Resets`, `5h Window`, and `Last Refresh` in separated tray sections
- Keeps notifications and launch-at-login toggles away from the manual refresh action to reduce accidental clicks
- Lets you open the dashboard, toggle the mini panel, and adjust menu bar preferences from the lower settings section

## Privacy and Storage

- No browser session is required
- No Chrome dependency is needed
- The app reads local Codex state only
- Refresh logs are redacted to avoid leaking tokens, cookies, or account details
- Runtime data and logs are kept out of version control
- Local artifacts under `data/`, `logs/`, `.playwright-mcp/`, and other generated files are intended to remain untracked

## Refresh Behavior

- Normal timer refresh runs every 5 minutes
- A forced refresh is deduped within 10 seconds
- Mac wake events schedule retries at 5s, 15s, 30s, and 60s
- Wake retry sequences stop after the first successful refresh
- Screen unlock triggers a forced refresh
- Skipped or failed refreshes keep the timer chain alive so automation continues

## Development Rules

This project is optimized for AI-assisted development with Codex and GPT Projects.

The core development rules live in [agents.md](./agents.md). Keep implementations local-first, privacy-first, low-frequency, aligned with the native macOS menubar style, and focused on long-term stability.

## Chinese Documentation

For the full Chinese version, see [readme-zh.md](./readme-zh.md).
