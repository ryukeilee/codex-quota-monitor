import path from 'node:path';
import fs from 'node:fs';

import pino from 'pino';

const SENSITIVE_KEY_PATTERN = /(token|cookie|authorization|auth|session|secret|password|apiKey|apikey|account|email|user)/i;
const SENSITIVE_TEXT_PATTERNS = [
  /(Bearer\s+)[A-Za-z0-9\-._~+/=]+/gi,
  /((?:token|cookie|authorization|auth|session|secret|password|api[_-]?key)\s*[:=]\s*)([^,\s;]+)/gi
];

function scrubText(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return SENSITIVE_TEXT_PATTERNS.reduce((text, pattern) => text.replace(pattern, '$1[REDACTED]'), value);
}

function sanitizeValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubText(value.message),
      stack: scrubText(value.stack ?? '')
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, '[REDACTED]'];
      }

      return [key, sanitizeValue(entryValue)];
    }));
  }

  return scrubText(value);
}

function sanitizeArgs(args) {
  return args.map((arg) => sanitizeValue(arg));
}

export function createLogger(baseDir = process.cwd()) {
  const logDir = path.join(baseDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const baseLogger = pino({
    level: 'info',
    transport: {
      target: 'pino/file',
      options: {
        destination: path.join(logDir, 'app.log'),
        mkdir: true
      }
    }
  });

  return {
    info: (...args) => baseLogger.info(...sanitizeArgs(args)),
    warn: (...args) => baseLogger.warn(...sanitizeArgs(args)),
    error: (...args) => baseLogger.error(...sanitizeArgs(args)),
    debug: (...args) => baseLogger.debug(...sanitizeArgs(args))
  };
}
