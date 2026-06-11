import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCodexSpawnEnv,
  classifyWhamUsageFailure,
  normalizeRateLimitsResponse,
  readLiveRateLimits,
  resolveCodexExecutablePath,
  resolveNodeExecutablePath
} from '../src/session/codex-rate-limit-reader.js';

test('normalizeRateLimitsResponse maps app-server rate limits into percent summaries', () => {
  const result = normalizeRateLimitsResponse({
    rateLimits: {
      individualLimit: {
        limit: '25071924',
        used: '503438',
        remainingPercent: 98,
        resetsAt: 1791234567
      },
      primary: {
        usedPercent: 10,
        windowDurationMins: 300,
        resetsAt: 1791234567
      },
      secondary: {
        usedPercent: 24,
        windowDurationMins: 10080,
        resetsAt: 1791235567
      },
      credits: { balance: 12.5 },
      planType: 'pro'
    }
  });

  assert.ok(result);
  assert.equal(result.sourceLabel, 'codex-account-rate-limits');
  assert.equal(result.primary.used, 10);
  assert.equal(result.primary.remainingPercent, 90);
  assert.equal(result.primary.presentation, 'percent');
  assert.equal(result.primary.windowState, 'healthy');
  assert.equal(result.primary.nextRecoveryAt, new Date(1791234567 * 1000).toISOString());
  assert.equal(result.secondary.used, 24);
  assert.equal(result.secondary.remainingPercent, 76);
  assert.equal(result.secondary.presentation, 'percent');
  assert.equal(result.secondary.nextRecoveryAt, new Date(1791235567 * 1000).toISOString());
  assert.equal(result.individualLimit.remainingPercent, 98);
  assert.equal(result.credits.balance, 12.5);
  assert.equal(result.planType, 'pro');
});

test('normalizeRateLimitsResponse prefers the codex bucket from rateLimitsByLimitId when available', () => {
  const result = normalizeRateLimitsResponse({
    rateLimits: {
      primary: {
        usedPercent: 10,
        windowDurationMins: 15,
        resetsAt: 1791234567
      },
      secondary: {
        usedPercent: 24,
        windowDurationMins: 60,
        resetsAt: 1791235567
      }
    },
    rateLimitsByLimitId: {
      codex: {
        limitId: 'codex',
        primary: {
          usedPercent: 32,
          windowDurationMins: 300,
          resetsAt: 1791234567
        },
        secondary: {
          usedPercent: 68,
          windowDurationMins: 10080,
          resetsAt: 1791235567
        },
        rateLimitReachedType: null
      }
    }
  });

  assert.ok(result);
  assert.equal(result.primary.used, 32);
  assert.equal(result.primary.remainingPercent, 68);
  assert.equal(result.primary.windowDurationMins, 300);
  assert.equal(result.secondary.used, 68);
  assert.equal(result.secondary.remainingPercent, 32);
  assert.equal(result.secondary.windowDurationMins, 10080);
});

test('normalizeRateLimitsResponse accepts a primary-only codex bucket and falls back to codex_other for weekly data', () => {
  const result = normalizeRateLimitsResponse({
    rateLimitsByLimitId: {
      codex: {
        limitId: 'codex',
        primary: {
          usedPercent: 25,
          windowDurationMins: 300,
          resetsAt: 1791234567
        },
        secondary: null,
        rateLimitReachedType: null
      },
      codex_other: {
        limitId: 'codex_other',
        primary: {
          usedPercent: 42,
          windowDurationMins: 10080,
          resetsAt: 1791235567
        },
        secondary: null,
        rateLimitReachedType: null
      }
    }
  });

  assert.ok(result);
  assert.equal(result.primary.used, 25);
  assert.equal(result.primary.remainingPercent, 75);
  assert.equal(result.secondary.used, 42);
  assert.equal(result.secondary.remainingPercent, 58);
  assert.equal(result.secondary.windowDurationMins, 10080);
});

test('resolveCodexExecutablePath prefers an explicit executable path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-bin-'));
  const executablePath = path.join(tempDir, 'codex');
  fs.writeFileSync(executablePath, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(executablePath, 0o755);

  assert.equal(resolveCodexExecutablePath({
    env: {
      CODEX_BIN: executablePath
    }
  }), executablePath);
});

test('resolveCodexExecutablePath searches PATH-style directories', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-path-'));
  const executablePath = path.join(tempDir, 'codex');
  fs.writeFileSync(executablePath, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(executablePath, 0o755);

  assert.equal(resolveCodexExecutablePath({
    env: {
      PATH: tempDir
    },
    extraSearchPaths: []
  }), executablePath);
});

test('resolveNodeExecutablePath prefers an explicit executable path and keeps it on PATH for spawned codex children', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-path-'));
  const nodeExecutablePath = path.join(tempDir, 'node');
  fs.writeFileSync(nodeExecutablePath, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(nodeExecutablePath, 0o755);

  assert.equal(resolveNodeExecutablePath({
    env: {
      NODE_BIN: nodeExecutablePath
    }
  }), nodeExecutablePath);

  const spawnEnv = buildCodexSpawnEnv({
    NODE_BIN: nodeExecutablePath,
    PATH: '/usr/bin'
  });

  assert.ok(spawnEnv.PATH.split(path.delimiter).includes(tempDir));
});

function createFakeCodexAppServer(tempDir, payload) {
  const handlerPath = path.join(tempDir, 'app-server-handler.mjs');
  const executablePath = path.join(tempDir, 'codex');
  const handlerSource = [
    `const payload = ${JSON.stringify(payload)};`,
    "let buffer = '';",
    '',
    'function emit(message) {',
    '  process.stdout.write(JSON.stringify(message) + "\\n");',
    '}',
    '',
    'function handleLine(line) {',
    '  if (!line) {',
    '    return;',
    '  }',
    '',
    '  const message = JSON.parse(line);',
    '',
    "  if (message.method === 'initialize') {",
    "    emit({ id: message.id, result: { capabilities: {} } });",
    '    return;',
    '  }',
    '',
    "  if (message.method === 'account/rateLimits/read') {",
    '    emit({ id: message.id, result: payload });',
    '  }',
    '}',
    '',
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => {",
    '  buffer += chunk;',
    '  let newlineIndex = buffer.indexOf("\\n");',
    '',
    '  while (newlineIndex >= 0) {',
    '    const line = buffer.slice(0, newlineIndex).trim();',
    '    buffer = buffer.slice(newlineIndex + 1);',
    '    handleLine(line);',
    '    newlineIndex = buffer.indexOf("\\n");',
    '  }',
    '});',
    ''
  ].join('\n');

  fs.writeFileSync(handlerPath, handlerSource);
  fs.writeFileSync(executablePath, `#!/bin/sh
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(handlerPath)} "$@"
`);
  fs.chmodSync(executablePath, 0o755);
  return executablePath;
}

test('readLiveRateLimits prefers app-server in auto mode for ChatGPT auth', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-auth-'));
  const authFilePath = path.join(tempDir, 'auth.json');
  const payload = {
    rateLimitsByLimitId: {
      codex: {
        primary: {
          usedPercent: 16,
          windowDurationMins: 300,
          resetsAt: 1791234567
        },
        secondary: {
          usedPercent: 12,
          windowDurationMins: 10080,
          resetsAt: 1791235567
        },
        individualLimit: {
          remainingPercent: 88,
          resetsAt: 1791235567
        },
        credits: null,
        planType: 'pro',
        rateLimitReachedType: null
      },
      codex_other: {
        primary: {
          usedPercent: 12,
          windowDurationMins: 10080,
          resetsAt: 1791235567
        }
      }
    }
  };
  fs.writeFileSync(authFilePath, JSON.stringify({
    auth_mode: 'chatgpt',
    tokens: {
      access_token: 'test-access-token',
      account_id: 'acct-test-123'
    }
  }));

  const previousCodexBin = process.env.CODEX_BIN;
  try {
    const calls = [];
    const executablePath = createFakeCodexAppServer(tempDir, payload);
    process.env.CODEX_BIN = executablePath;
    const result = await readLiveRateLimits({
      authFilePath,
      timeoutMs: 1000,
      fetchImpl: async () => {
        calls.push('wham_usage');
        return {
          ok: true,
          status: 200,
          headers: {
            get(name) {
              return name === 'content-type' ? 'application/json' : null;
            }
          },
          async text() {
            return JSON.stringify(payload);
          }
        };
      }
    });

    assert.equal(calls.length, 0);
    assert.equal(result.sourceOrigin, 'codex_app_server');
    assert.equal(result.primary.remainingPercent, 84);
    assert.equal(result.secondary.remainingPercent, 88);
    assert.equal(result.individualLimit.remainingPercent, 88);
  } finally {
    process.env.CODEX_BIN = previousCodexBin;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('classifyWhamUsageFailure groups wham failures into timeout transport auth and status', () => {
  assert.equal(classifyWhamUsageFailure(Object.assign(new Error('wham usage request timed out'), {
    name: 'AbortError'
  })), 'timeout');

  assert.equal(classifyWhamUsageFailure(Object.assign(new Error('error sending request for url (https://chatgpt.com/backend-api/wham/usage)'), {
    code: 'ECONNRESET'
  })), 'transport');

  assert.equal(classifyWhamUsageFailure(Object.assign(new Error('GET https://chatgpt.com/backend-api/wham/usage failed: 403; content-type=application/json; body={}'), {
    status: 403
  })), 'auth');

  assert.equal(classifyWhamUsageFailure(Object.assign(new Error('GET https://chatgpt.com/backend-api/wham/usage failed: 500; content-type=application/json; body={}'), {
    status: 500
  })), 'status');
});

test('readLiveRateLimits falls back to app-server after a wham transport failure in auto mode', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-fallback-'));
  const authFilePath = path.join(tempDir, 'auth.json');
  const previousCodexBin = process.env.CODEX_BIN;
  const executablePath = createFakeCodexAppServer(tempDir, {
    rateLimitsByLimitId: {
      codex: {
        primary: {
          usedPercent: 18,
          windowDurationMins: 300,
          resetsAt: 1791234567
        },
        secondary: {
          usedPercent: 44,
          windowDurationMins: 10080,
          resetsAt: 1791235567
        },
        credits: null,
        planType: 'pro',
        rateLimitReachedType: null
      }
    }
  });

  fs.writeFileSync(authFilePath, JSON.stringify({
    auth_mode: 'chatgpt',
    tokens: {
      access_token: 'test-access-token',
      account_id: 'acct-test-123'
    }
  }));
  process.env.CODEX_BIN = executablePath;

  try {
    const attempts = [];
    const result = await readLiveRateLimits({
      authFilePath,
      timeoutMs: 1000,
      fetchImpl: async () => {
        throw new Error('wham usage should not be reached when app-server succeeds first');
      },
      onSourceAttemptFailure: (failure) => {
        attempts.push(failure);
      }
    });

    assert.equal(attempts.length, 0);
    assert.equal(result.sourceOrigin, 'codex_app_server');
    assert.equal(result.primary.remainingPercent, 82);
    assert.equal(result.secondary.remainingPercent, 56);
  } finally {
    process.env.CODEX_BIN = previousCodexBin;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('readLiveRateLimits times out a hanging wham usage request in wham-only mode', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-wham-timeout-'));
  const authFilePath = path.join(tempDir, 'auth.json');

  fs.writeFileSync(authFilePath, JSON.stringify({
    auth_mode: 'chatgpt',
    tokens: {
      access_token: 'test-access-token',
      account_id: 'acct-test-123'
    }
  }));

  try {
    const attempts = [];
    await assert.rejects(
      readLiveRateLimits({
        authFilePath,
        sourcePreference: 'wham_usage',
        timeoutMs: 50,
        fetchImpl: async () => new Promise(() => {}),
        onSourceAttemptFailure: (failure) => {
          attempts.push(failure);
        }
      }),
      (error) => error?.kind === 'timeout' && error?.sourceOrigin === 'wham_usage'
    );

    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].sourceOrigin, 'wham_usage');
    assert.equal(attempts[0].kind, 'timeout');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
