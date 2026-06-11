# Codex Monitor

Codex Monitor is a quiet, privacy-first macOS menu bar app for people who use Codex every day. It keeps your remaining quota visible, stays local, and gets out of the way.

[中文版说明](./readme-zh.md)

## Highlights

- Live Codex quota at a glance
- Native-style menu bar display with a compact tray menu
- Local-first and privacy-first by design
- Automatic refresh with a unified low-frequency scheduler
- Manual refresh shows a clear busy state so it is obvious when a refresh is in progress
- After manual refresh completes, the app re-reads the latest dashboard before repainting the UI, so the view stays aligned with the underlying data
- Tray menu stays compact and only surfaces the most important status at a glance
- HUD-style dashboard with a single-screen control layout, status radar, and reactor-like quota readout
- Quota burn rate analysis that answers whether the current pace is too fast, how long it can last, and whether intensity should be lowered
- Dashboard view for reset timing, trends, and local flow advice hints
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

The app prefers the authenticated ChatGPT `wham/usage` quota endpoint, then falls back to the local Codex app-server, and finally local snapshots when needed.

Source priority:

1. Live `https://chatgpt.com/backend-api/wham/usage` data from the authenticated ChatGPT account
2. Live `account/rateLimits/read` data from the local Codex app-server, preferring the `rateLimitsByLimitId.codex` bucket when available and falling back to `rateLimitsByLimitId.codex_other` for weekly data if needed
3. Local snapshot fallback in `data/source-snapshot.json`

If `wham/usage` fails, the app now classifies the failure as `timeout`, `transport`, `auth`, or `status`, then retries the local app-server in `auto` mode before falling back to local snapshot data.

The live source provides:

- 5-hour quota remaining percentage
- Weekly quota remaining percentage
- Reset timestamps
- A clear source label so you can tell whether the app is showing live `wham/usage`, app-server, or local snapshot data

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
- Surfaces a compact overview first so the tray stays easy to scan
- Keeps deeper details out of the first glance
- Keeps manual refresh separate from settings toggles
- Opens the dashboard and preferences from the lower section

## Dashboard

- The main window uses a single-screen HUD layout rather than a tall scrolling page
- The core readout centers on remaining quota, weekly quota, 5-hour window, burn rate, recovery timing, and development guidance
- The history chart and recent records are secondary signals and stay visually compact
- The styling intentionally leans into a high-contrast cyber / reactor-control aesthetic while keeping the information readable

## Privacy and Storage

- No browser session is required
- No Chrome dependency is needed
- The app reads local Codex state only
- Flow advice is derived from local quota levels, freshness, and refresh state only
- Refresh logs are redacted to avoid leaking tokens, cookies, or account details
- Low-quota reminders stay quiet by default and are shown in the tray menu first
- Runtime data and logs are kept out of version control
- Local artifacts under `data/`, `logs/`, `.playwright-mcp/`, and other generated files are intended to remain untracked

## Refresh Behavior

- A single scheduler owns automatic, manual, deferred, and retry refreshes
- Normal timer refresh runs every 5 minutes
- Forced refreshes are deduped within 10 seconds
- Manual refresh switches the tray and in-app button into a visible busy state while the refresh is running
- Sleep pauses the scheduler instead of letting background timers run
- Mac wake and screen unlock trigger one immediate refresh, then retry at 5s, 15s, 30s, and 60s if needed
- Wake retry sequences stop after the first successful live refresh
- Failure paths enter backoff and keep the next refresh chain alive
- In `auto` mode, live quota reads try `wham/usage` first and then the local app-server before they give up to local snapshot data
- After a long sleep, stale local state is re-anchored to the current 5-hour window
- Flow advice stays short, local, and non-intrusive
- Burn-rate analysis is computed locally from quota snapshots only and does not inspect chats, prompts, or code content

## Development Rules

This project is optimized for AI-assisted development with Codex and GPT Projects.

The core development rules live in [agents.md](./agents.md). Keep implementations local-first, privacy-first, low-frequency, aligned with the native macOS menu bar style, and focused on long-term stability.

## Chinese Documentation

For the full Chinese version, see [readme-zh.md](./readme-zh.md).
