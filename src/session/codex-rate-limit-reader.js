import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 10_000;

function toIsoTimestamp(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return null;
  }

  return new Date(seconds * 1000).toISOString();
}

function normalizeUsedPercentWindow(window) {
  if (!window || typeof window.usedPercent !== 'number') {
    return null;
  }

  const remainingPercent = Math.max(0, 100 - window.usedPercent);
  return {
    limit: 100,
    used: window.usedPercent,
    remaining: remainingPercent,
    remainingPercent,
    windowUsageCount: 0,
    windowState: remainingPercent <= 15 ? 'near_limit' : 'healthy',
    nextRecoveryAt: toIsoTimestamp(window.resetsAt),
    presentation: 'percent',
    windowDurationMins: window.windowDurationMins ?? null
  };
}

function normalizeRemainingPercentWindow(window) {
  if (!window || typeof window.remainingPercent !== 'number') {
    return null;
  }

  const remainingPercent = Math.max(0, Math.min(100, window.remainingPercent));
  return {
    limit: 100,
    used: Math.max(0, 100 - remainingPercent),
    remaining: remainingPercent,
    remainingPercent,
    windowUsageCount: 0,
    windowState: remainingPercent <= 15 ? 'near_limit' : 'healthy',
    nextRecoveryAt: toIsoTimestamp(window.resetsAt),
    presentation: 'percent',
    windowDurationMins: null
  };
}

export function normalizeRateLimitsResponse(response) {
  const rateLimits = response?.rateLimits ?? response?.result?.rateLimits;
  if (!rateLimits?.primary || !rateLimits?.secondary) {
    return null;
  }

  return {
    sourceLabel: 'codex-account-rate-limits',
    primary: normalizeRemainingPercentWindow(rateLimits.individualLimit) ?? normalizeUsedPercentWindow(rateLimits.primary),
    secondary: normalizeUsedPercentWindow(rateLimits.secondary),
    credits: rateLimits.credits ?? null,
    planType: rateLimits.planType ?? null,
    rateLimitReachedType: rateLimits.rateLimitReachedType ?? null
  };
}

function createJsonRpcClient({ cwd, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const child = spawn('codex', ['app-server', '--stdio'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdoutBuffer = '';
  let stderrBuffer = '';
  let nextId = 1;
  const pending = new Map();
  let closed = false;

  function cleanup() {
    if (!child.killed) {
      child.kill();
    }
  }

  function rejectAll(error) {
    if (closed) {
      return;
    }
    closed = true;
    cleanup();
    for (const pendingRequest of pending.values()) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(error);
    }
    pending.clear();
  }

  function handleLine(line) {
    if (!line) {
      return;
    }

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (message?.id != null && pending.has(message.id)) {
      const pendingRequest = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(pendingRequest.timer);

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message ?? 'codex app-server request failed'));
        return;
      }

      pendingRequest.resolve(message.result ?? null);
    }
  }

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    let newlineIndex = stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      handleLine(line);
      newlineIndex = stdoutBuffer.indexOf('\n');
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString('utf8');
  });

  child.on('error', (error) => {
    rejectAll(error);
  });

  child.on('exit', (code) => {
    if (!closed) {
      rejectAll(new Error(`codex app-server exited with code ${code}${stderrBuffer ? `: ${stderrBuffer.trim()}` : ''}`));
    }
  });

  function request(method, params, requestTimeoutMs = timeoutMs) {
    if (closed) {
      return Promise.reject(new Error('codex app-server client is closed'));
    }

    const id = nextId++;
    const payload = JSON.stringify({ id, method, params });

    return new Promise((resolveRequest, rejectRequest) => {
      const requestTimer = setTimeout(() => {
        pending.delete(id);
        rejectAll(new Error(`codex app-server request timed out: ${method}`));
      }, requestTimeoutMs);

      pending.set(id, {
        timer: requestTimer,
        resolve: resolveRequest,
        reject: rejectRequest
      });

      try {
        child.stdin.write(`${payload}\n`);
      } catch (error) {
        clearTimeout(requestTimer);
        pending.delete(id);
        rejectRequest(error);
      }
    });
  }

  function notify(method, params) {
    child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  const ready = request('initialize', {
    clientInfo: {
      name: 'codex-monitor',
      title: 'Codex Monitor',
      version: '0.1.0'
    }
  }).then(() => {
    notify('initialized');
  });

  return {
    child,
    request,
    ready
  };
}

export async function readLiveRateLimits({ cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const client = createJsonRpcClient({ cwd, timeoutMs });

  try {
    await client.ready;
    const result = await client.request('account/rateLimits/read');
    const normalized = normalizeRateLimitsResponse(result);
    if (!normalized) {
      throw new Error('account/rateLimits/read returned no usable rate limits');
    }

    return normalized;
  } finally {
    client.child.kill();
  }
}
