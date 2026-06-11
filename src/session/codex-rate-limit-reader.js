import fs from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CHATGPT_BACKEND_URL = 'https://chatgpt.com/backend-api';
const DEFAULT_NODE_SEARCH_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin'
];
const DEFAULT_CODEX_SEARCH_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/Applications/Codex.app/Contents/Resources',
  '/Applications/Codex.app/Contents/MacOS'
];

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

function normalizeRateLimitWindowByUsedPercent(window) {
  if (!window || typeof window.used_percent !== 'number') {
    return null;
  }

  const remainingPercent = Math.max(0, Math.min(100, 100 - window.used_percent));
  return {
    limit: 100,
    used: window.used_percent,
    remaining: remainingPercent,
    remainingPercent,
    windowUsageCount: 0,
    windowState: remainingPercent <= 15 ? 'near_limit' : 'healthy',
    nextRecoveryAt: toIsoTimestamp(window.reset_at),
    presentation: 'percent',
    windowDurationMins: window.limit_window_seconds != null
      ? Math.round(window.limit_window_seconds / 60)
      : null
  };
}

function normalizeWhamSpendControlLimit(window) {
  if (!window) {
    return null;
  }

  if (typeof window.remaining_percent === 'number' || typeof window.remainingPercent === 'number') {
    return normalizeRemainingPercentWindow({
      remainingPercent: window.remaining_percent ?? window.remainingPercent,
      resetsAt: window.reset_at ?? window.resetsAt
    });
  }

  if (typeof window.used_percent === 'number' || typeof window.usedPercent === 'number') {
    const usedPercent = window.used_percent ?? window.usedPercent;
    return normalizeRemainingPercentWindow({
      remainingPercent: Math.max(0, Math.min(100, 100 - usedPercent)),
      resetsAt: window.reset_at ?? window.resetsAt
    });
  }

  return null;
}

function normalizeWhamUsageResponse(response) {
  const rateLimit = response?.rate_limit ?? response?.result?.rate_limit;
  if (!rateLimit?.primary_window || !rateLimit?.secondary_window) {
    return null;
  }

  return {
    sourceLabel: 'codex-account-rate-limits',
    sourceOrigin: 'wham_usage',
    primary: normalizeRateLimitWindowByUsedPercent(rateLimit.primary_window),
    secondary: normalizeRateLimitWindowByUsedPercent(rateLimit.secondary_window),
    credits: response?.credits ?? response?.result?.credits ?? null,
    planType: response?.plan_type ?? response?.result?.plan_type ?? null,
    rateLimitReachedType: response?.rate_limit_reached_type ?? response?.result?.rate_limit_reached_type ?? null,
    individualLimit: normalizeWhamSpendControlLimit(
      rateLimit.individual_limit
      ?? response?.spend_control?.individual_limit
      ?? response?.result?.spend_control?.individual_limit
      ?? null
    )
  };
}

export function normalizeRateLimitsResponse(response) {
  const rateLimitsByLimitId = response?.rateLimitsByLimitId ?? response?.result?.rateLimitsByLimitId ?? {};
  const preferredRateLimits = rateLimitsByLimitId.codex ?? response?.rateLimits ?? response?.result?.rateLimits;
  if (!preferredRateLimits?.primary || !preferredRateLimits?.secondary) {
    return null;
  }

  return {
    sourceLabel: 'codex-account-rate-limits',
    sourceOrigin: 'codex_app_server',
    primary: normalizeUsedPercentWindow(preferredRateLimits.primary),
    secondary: normalizeUsedPercentWindow(preferredRateLimits.secondary),
    credits: preferredRateLimits.credits ?? null,
    planType: preferredRateLimits.planType ?? null,
    rateLimitReachedType: preferredRateLimits.rateLimitReachedType ?? null,
    individualLimit: normalizeRemainingPercentWindow(preferredRateLimits.individualLimit)
  };
}

export function buildCodexSpawnEnv(env = process.env, extraSearchPaths = []) {
  const nodeExecutable = resolveNodeExecutablePath({
    env,
    extraSearchPaths
  });
  const nodeDir = path.dirname(nodeExecutable);
  const existingPathEntries = env.PATH ? env.PATH.split(path.delimiter) : [];
  const mergedPath = [...new Set([
    nodeDir,
    ...DEFAULT_NODE_SEARCH_PATHS,
    ...existingPathEntries
  ].filter(Boolean))].join(path.delimiter);

  return {
    ...env,
    PATH: mergedPath
  };
}

function createJsonRpcClient({ cwd, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const child = spawn(resolveCodexExecutablePath(), ['app-server', '--stdio'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: buildCodexSpawnEnv(process.env)
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

export function resolveCodexExecutablePath({
  env = process.env,
  extraSearchPaths = []
} = {}) {
  const explicitPath = env.CODEX_BIN ?? env.CODEX_EXECUTABLE;
  if (explicitPath && isExecutableFile(explicitPath)) {
    return explicitPath;
  }

  const searchPaths = [
    ...extraSearchPaths,
    ...(env.PATH ? env.PATH.split(path.delimiter) : []),
    ...DEFAULT_CODEX_SEARCH_PATHS
  ];

  for (const dir of searchPaths) {
    if (!dir) {
      continue;
    }

    const candidate = dir.endsWith('codex') ? dir : path.join(dir, 'codex');
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `unable to locate codex executable; checked CODEX_BIN/CODEX_EXECUTABLE, PATH, and ${DEFAULT_CODEX_SEARCH_PATHS.join(', ')}`
  );
}

export function resolveNodeExecutablePath({
  env = process.env,
  extraSearchPaths = []
} = {}) {
  const explicitPath = env.NODE_BIN ?? env.NODE_EXECUTABLE;
  if (explicitPath && isExecutableFile(explicitPath)) {
    return explicitPath;
  }

  const searchPaths = [
    ...extraSearchPaths,
    ...(env.PATH ? env.PATH.split(path.delimiter) : []),
    ...DEFAULT_NODE_SEARCH_PATHS
  ];

  for (const dir of searchPaths) {
    if (!dir) {
      continue;
    }

    const candidate = dir.endsWith('node') ? dir : path.join(dir, 'node');
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `unable to locate node executable; checked NODE_BIN/NODE_EXECUTABLE, PATH, and ${DEFAULT_NODE_SEARCH_PATHS.join(', ')}`
  );
}

function readAuthJson(authFilePath = path.join(os.homedir(), '.codex', 'auth.json')) {
  if (!fs.existsSync(authFilePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(authFilePath, 'utf8'));
  } catch {
    return null;
  }
}

function getAuthHeaders(auth) {
  const headers = {
    accept: 'application/json',
    'user-agent': 'codex-cli'
  };

  const accessToken = auth?.tokens?.access_token ?? auth?.OPENAI_API_KEY ?? null;
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  const accountId = auth?.tokens?.account_id ?? auth?.account_id ?? null;
  if (accountId) {
    headers['ChatGPT-Account-Id'] = accountId;
  }

  return headers;
}

async function fetchWhamUsageRateLimits({
  authFilePath = path.join(os.homedir(), '.codex', 'auth.json'),
  baseUrl = DEFAULT_CHATGPT_BACKEND_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch
} = {}) {
  const auth = readAuthJson(authFilePath);
  const headers = getAuthHeaders(auth);
  if (!headers.authorization) {
    throw new Error('missing ChatGPT access token for wham usage request');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('wham usage request timed out')), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/wham/usage`, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    const contentType = response.headers.get('content-type') ?? '';
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`GET ${baseUrl}/wham/usage failed: ${response.status}; content-type=${contentType}; body=${bodyText}`);
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (error) {
      throw new Error(`Decode error for ${baseUrl}/wham/usage: ${error?.message ?? String(error)}; content-type=${contentType}; body=${bodyText}`);
    }

    const normalized = normalizeWhamUsageResponse(payload);
    if (!normalized) {
      throw new Error('wham/usage returned no usable rate limits');
    }

    return normalized;
  } finally {
    clearTimeout(timeout);
  }
}

function isExecutableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readLiveRateLimits({
  cwd = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  authFilePath = path.join(os.homedir(), '.codex', 'auth.json'),
  baseUrl = DEFAULT_CHATGPT_BACKEND_URL,
  fetchImpl = fetch
} = {}) {
  const auth = readAuthJson(authFilePath);
  if (auth?.auth_mode === 'chatgpt') {
    try {
      return await fetchWhamUsageRateLimits({
        authFilePath,
        baseUrl,
        timeoutMs,
        fetchImpl
      });
    } catch {
      // Fall back to the local app-server only if the web source is unavailable.
    }
  }

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
