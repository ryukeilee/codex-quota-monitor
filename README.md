# Codex Monitor

Codex Monitor is a quiet, privacy-first macOS menu bar app for people who use Codex every day. It keeps your remaining quota visible, stays local, and gets out of the way.

[中文版说明](./readme-zh.md)

## Highlights

- Live Codex quota at a glance
- Native-style menu bar display with a compact tray menu
- Local-first and privacy-first by design
- Automatic refresh with a unified low-frequency scheduler
- Manual refresh shows a clear busy state so it is obvious when a refresh is in progress, and the tray now also surfaces refresh success, failure, or a just-refreshed state
- After manual refresh completes, the app re-reads the latest dashboard before repainting the UI, so the view stays aligned with the underlying data
- Manual refresh can preempt a non-manual in-flight refresh, so startup or scheduled work will not trap a user-triggered refresh behind an older request
- The tray shows the most recent update time and warns when data is older than 10 minutes
- The tray also surfaces a lightweight data health view with status and a short reason line
- Refresh flow logs are kept at the source, data, state, and UI boundary so manual, interval, startup, and resume refreshes can be traced end to end
- The app defaults to conservative rendering and avoids always-on visual effects that can keep Electron’s GPU usage elevated
- The history chart is treated as optional and stays disabled by default unless explicitly enabled for debugging
- When weekly quota is temporarily unavailable, the tray keeps weekly fields as unavailable instead of substituting the 5-hour value
- Tray menu stays compact and only surfaces the most important status at a glance
- Pure menu bar operation with no always-open main window
- Quota burn rate analysis that answers whether the current pace is too fast, how long it can last, and whether intensity should be lowered
- Auto-launch support

## Quick Start

```bash
npm install
npm test
npm run build:app
```

After building, open `dist/Codex Monitor.app` from Finder to launch the packaged app directly.

The packaging script stages the app bundle under `dist/` for local distribution and validation.

The packaged app lives at `dist/Codex Monitor.app`.

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
- Shows `--` in the title and `Weekly unavailable` state semantics when live data has no weekly quota yet
- Shows the latest update time in the tray menu and flags stale data after 10 minutes
- Shows data status, a short reason line when needed, and keeps the tray menu compact
- Surfaces a compact overview first so the tray stays easy to scan
- Keeps deeper details out of the first glance
- Keeps manual refresh separate from settings toggles
- Keeps the app menu-bar only, with settings and refresh actions living in the tray menu
- Does not expose menu toggles for menu-bar percentage display or pure menu-bar mode

## Runtime Signals

- The tray menu is the primary surface for status, refresh, and lightweight settings
- The app no longer opens a main window, so there is no always-on renderer to keep the GPU busy
- Optional internal UI assets remain in the tree for reference, but they are not part of the normal launch path

## Privacy and Storage

- No browser session is required
- No Chrome dependency is needed
- The app reads local Codex state only
- Flow advice is derived from local quota levels, freshness, and refresh state only
- Refresh logs are redacted to avoid leaking tokens, cookies, or account details
- Low-quota reminders stay quiet by default and are shown in the tray menu first
- Runtime data and logs are kept out of version control
- Local artifacts under `data/`, `logs/`, `.playwright-mcp/`, and other generated files are intended to remain untracked
- The app no longer opens a heavyweight main window, which keeps the runtime lighter and avoids unnecessary GPU work

## Refresh Behavior

- A single scheduler owns automatic, manual, deferred, and retry refreshes
- Normal timer refresh runs every 5 minutes
- Forced refreshes are deduped within 10 seconds
- Manual refresh switches the tray and in-app button into a visible busy state while the refresh is running
- Manual refresh also provides immediate visible feedback for refreshing, success, failure, and just-refreshed states
- A lightweight health status layer marks data as healthy, delayed, stale, fallback, or error without changing source priority
- Sleep pauses the scheduler instead of letting background timers run
- Mac wake and screen unlock trigger one immediate refresh, then retry at 5s, 15s, 30s, and 60s if needed
- Wake retry sequences stop after the first successful live refresh
- Failure paths enter backoff and keep the next refresh chain alive
- In `auto` mode, live quota reads try `wham/usage` first and then the local app-server before they give up to local snapshot data
- Refresh diagnostics distinguish `manual`, `interval`, `startup`, and `resume` paths so refresh-chain breakpoints are easier to inspect from logs
- Manual refresh preempts older non-manual in-flight work, which keeps the tray button responsive even if startup refresh is still running
- After a long sleep, stale local state is re-anchored to the current 5-hour window
- Flow advice stays short, local, and non-intrusive
- Burn-rate analysis is computed locally from quota snapshots only and does not inspect chats, prompts, or code content
- The default renderer path is software-first to reduce the chance of a hot laptop during normal use

## Development Rules

This project is optimized for AI-assisted development with Codex and GPT Projects.

The core development rules live in [agents.md](./agents.md). Keep implementations local-first, privacy-first, low-frequency, aligned with the native macOS menu bar style, and focused on long-term stability.

## Chinese Documentation

For the full Chinese version, see [readme-zh.md](./readme-zh.md).
