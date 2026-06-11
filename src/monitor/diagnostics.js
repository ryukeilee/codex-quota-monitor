import fs from 'node:fs';
import path from 'node:path';

import {
  formatQuotaHealthDuration,
} from '../core/quota-health.js';

const DEFAULT_MAX_EVENTS = 200;
const SENSITIVE_PATTERNS = [
  /(Bearer\s+)[A-Za-z0-9\-._~+/=]+/gi,
  /((?:token|cookie|authorization|auth|session|secret|password|api[_-]?key)\s*[:=]\s*)([^,\s;]+)/gi,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
];

function scrubText(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const scrubbed = SENSITIVE_PATTERNS.reduce((text, pattern) => (
    text.replace(pattern, '[REDACTED]')
  ), value);

  return scrubbed.length > 200 ? `${scrubbed.slice(0, 197)}...` : scrubbed;
}

export function sanitizeDiagnosticMessage(value) {
  return scrubText(typeof value === 'string' ? value : '暂无');
}

function formatDateTime(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(/\//g, '-');
}

function formatTime(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDiagnosticSource(source) {
  switch (source) {
    case 'wham_usage':
      return 'wham/usage';
    case 'app_server_rate_limits':
      return 'app-server';
    case 'snapshot_fallback':
      return 'snapshot_fallback';
    case 'unknown':
    default:
      return 'unknown';
  }
}

function normalizeEvent(event) {
  const timestamp = Number.isFinite(event?.timestamp) ? event.timestamp : Date.now();
  const reason = ['manual', 'auto', 'wake', 'retry', 'startup'].includes(event?.reason)
    ? event.reason
    : 'auto';
  const result = ['success', 'failed', 'skipped', 'fallback'].includes(event?.result)
    ? event.result
    : 'skipped';
  const source = typeof event?.source === 'string' && event.source ? scrubText(event.source) : undefined;
  const message = sanitizeDiagnosticMessage(event?.message);

  return {
    timestamp,
    reason,
    result,
    source,
    message
  };
}

function readEventsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed.map(normalizeEvent).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeEventsFile(filePath, events) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(events, null, 2)}\n`);
}

export function createDiagnosticsStore({
  storageRoot = process.cwd(),
  maxEvents = DEFAULT_MAX_EVENTS,
  now = () => Date.now()
} = {}) {
  const filePath = path.join(storageRoot, 'diagnostics.json');
  let events = readEventsFile(filePath).slice(-maxEvents);

  function persist() {
    writeEventsFile(filePath, events.slice(-maxEvents));
  }

  return {
    recordRefreshEvent(event) {
      const nextEvent = normalizeEvent({
        ...event,
        timestamp: event?.timestamp ?? now()
      });
      events = [...events, nextEvent].slice(-maxEvents);
      persist();
      return nextEvent;
    },
    getRecentEvents() {
      return [...events];
    },
    buildDiagnosticText({
      dashboard,
      healthStatus,
      now: nowValue = now()
    } = {}) {
      void nowValue;
      const status = healthStatus ?? dashboard?.quotaHealth ?? null;
      const recentEvents = events.slice(-3).reverse();
      const lines = [
        'Codex Monitor Diagnostics',
        `Data Status: ${status?.level ?? 'unknown'}`,
        `Data Source: ${formatDiagnosticSource(status?.source ?? 'unknown')}`,
        `Last Refresh: ${formatDateTime(status?.lastRefreshAt ?? dashboard?.refreshStatus?.lastAttemptAt ?? dashboard?.lastRefreshStartedAt ?? dashboard?.refreshedAt ?? null)}`,
        `Last Successful Refresh: ${formatDateTime(status?.lastSuccessfulRefreshAt ?? dashboard?.refreshStatus?.lastSuccessAt ?? dashboard?.lastSuccessfulRefreshAt ?? dashboard?.refreshedAt ?? null)}`,
        `Next Auto Refresh: ${formatDateTime(status?.nextAutoRefreshAt ?? dashboard?.refreshStatus?.nextScheduledRefreshAt ?? null)}`,
        `Data Age: ${formatQuotaHealthDuration(status?.dataAgeMs ?? null)}`,
        `Fallback: ${status?.isFallback ? 'true' : 'false'}`,
        `Refreshing: ${status?.isRefreshing ? 'true' : 'false'}`,
        `Last Reason: ${status?.lastRefreshReason ?? 'none'}`,
        `Last Error: ${status?.lastErrorMessage ? sanitizeDiagnosticMessage(status.lastErrorMessage) : 'none'}`,
        'Recent Events:'
      ];

      if (recentEvents.length === 0) {
        lines.push('- none');
      } else {
        for (const event of recentEvents) {
          const time = formatTime(event.timestamp);
          const source = event.source ? ` ${event.source}` : '';
          lines.push(`- ${time} ${event.reason} ${event.result}${source ? ` ${source}` : ''} ${event.message}`.trim());
        }
      }

      return lines.join('\n');
    }
  };
}
