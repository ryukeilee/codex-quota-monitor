import fs from 'node:fs';
import path from 'node:path';

const SENSITIVE_PATTERNS = [
  {
    pattern: /(Bearer\s+)[A-Za-z0-9\-._~+/=]+/gi,
    replacement: '$1[REDACTED]'
  },
  {
    pattern: /((?:token|cookie|authorization|auth|session|secret|password|api[_-]?key)\s*[:=]\s*)([^,\s;]+)/gi,
    replacement: '$1[REDACTED]'
  },
  {
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    replacement: '[REDACTED]'
  }
];

function scrubText(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return SENSITIVE_PATTERNS.reduce((text, { pattern, replacement }) => text.replace(pattern, replacement), value);
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: scrubText(error.message ?? ''),
      stack: scrubText(error.stack ?? ''),
      code: typeof error.code === 'string' ? error.code : undefined,
      kind: typeof error.kind === 'string' ? error.kind : undefined,
      status: typeof error.status === 'number' ? error.status : undefined,
      sourceOrigin: typeof error.sourceOrigin === 'string' ? error.sourceOrigin : undefined
    };
  }

  return {
    name: typeof error?.name === 'string' ? error.name : 'Error',
    message: scrubText(typeof error === 'string' ? error : String(error)),
    stack: undefined,
    code: typeof error?.code === 'string' ? error.code : undefined,
    kind: typeof error?.kind === 'string' ? error.kind : undefined,
    status: typeof error?.status === 'number' ? error.status : undefined,
    sourceOrigin: typeof error?.sourceOrigin === 'string' ? error.sourceOrigin : undefined
  };
}

export function buildRefreshErrorRecord({
  stage,
  source,
  error,
  at = new Date().toISOString(),
  fallback = false,
  context = {}
} = {}) {
  return {
    at,
    stage: typeof stage === 'string' && stage ? stage : 'refresh',
    source: typeof source === 'string' && source ? source : 'unknown',
    fallback: Boolean(fallback),
    error: serializeError(error),
    context: Object.fromEntries(
      Object.entries(context ?? {}).map(([key, value]) => [
        key,
        typeof value === 'string' ? scrubText(value) : value
      ])
    )
  };
}

export function appendRefreshErrorLog({
  userDataRoot = process.cwd(),
  entry
} = {}) {
  if (!entry) {
    return null;
  }

  const logDir = path.join(userDataRoot, 'logs');
  const logPath = path.join(logDir, 'quota-refresh.log');
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  return logPath;
}

export function recordQuotaRefreshError({
  userDataRoot = process.cwd(),
  stage,
  source,
  error,
  fallback = false,
  context = {}
} = {}) {
  const entry = buildRefreshErrorRecord({
    stage,
    source,
    error,
    fallback,
    context
  });

  console.error('[quota-refresh:error]', entry);
  appendRefreshErrorLog({
    userDataRoot,
    entry
  });

  return entry;
}
