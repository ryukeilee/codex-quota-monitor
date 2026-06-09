# Codex Monitor

Codex Monitor is a quiet, privacy-first macOS menu bar app for people who use Codex every day. It keeps your remaining quota visible, stays local, and gets out of the way.

[中文版说明](./readme-zh.md)

## Highlights

- Live Codex quota at a glance
- Native-style menu bar display with a compact tray menu
- Local-first and privacy-first by design
- Automatic refresh with low-frequency polling
- Dashboard view for reset timing, trends, and prediction hints
- Auto-launch and pure menu bar mode support

## Quick Start

```bash
npm install
npm test
npm run build:app
```

After building, open `dist/Codex Monitor.app` from Finder to launch the packaged app directly.

`run.command` remains a development helper. For everyday use, the packaged `.app` is the recommended entry point.

## Data Sources

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

## System Tray

- Shows weekly remaining quota as a plain native-style percentage
- Surfaces reset timing, 5-hour window status, and last refresh in a compact menu
- Keeps manual refresh separate from settings toggles
- Opens the dashboard and preferences from the lower section

## Privacy and Storage

- No browser session is required
- No Chrome dependency is needed
- The app reads local Codex state only
- Refresh logs are redacted to avoid leaking tokens, cookies, or account details
- Runtime data and logs are kept out of version control
- Local artifacts under `data/`, `logs/`, `.playwright-mcp/`, and other generated files are intended to remain untracked

## Refresh Behavior

- Normal timer refresh runs every 5 minutes
- Forced refreshes are deduped within 10 seconds
- Mac wake events schedule retries at 5s, 15s, 30s, and 60s
- Wake retry sequences stop after the first successful refresh
- Screen unlock triggers a forced refresh
- After a long sleep, stale local state is re-anchored to the current 5-hour window
- Skipped or failed refreshes keep the timer chain alive

## Development Rules

This project is optimized for AI-assisted development with Codex and GPT Projects.

The core development rules live in [agents.md](./agents.md). Keep implementations local-first, privacy-first, low-frequency, aligned with the native macOS menu bar style, and focused on long-term stability.

## Chinese Documentation

For the full Chinese version, see [readme-zh.md](./readme-zh.md).
