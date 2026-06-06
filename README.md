# Codex Monitor

Codex Monitor is a privacy-first, local macOS menu bar app for tracking Codex usage and quota status.

[中文版说明](./readme-zh.md)

## Highlights

- Local-first Electron desktop app
- Live quota reads from the local Codex app-server
- Weekly quota retained in the UI
- Menu bar percentage display with low-quota warning state
- Mini stats panel
- Auto-launch support
- Pure menu bar mode with Dock hidden
- Low-frequency refresh strategy
- Local SQLite persistence for app state
- Usage history chart and prediction hints

## Getting Started

```bash
npm install
npm test
npm start
```

You can also launch the app by double-clicking [run.command](./run.command).

## Data Source

The app prefers live local quota data from the Codex app-server and falls back to local snapshots when needed.

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

## Tray Menu

- Shows the current 5-hour remaining percentage in the menu bar title
- Shows weekly remaining percentage inside the tray menu
- Shows warning symbol when the 5-hour window is close to the limit
- Lets you toggle the main window, mini panel, notifications, and menu bar display

## Privacy

- No browser session is required
- No Chrome dependency is needed
- The app reads local Codex state only
- Runtime data and logs are kept out of version control

## Chinese Docs

For the full Chinese version, see [readme-zh.md](./readme-zh.md).
