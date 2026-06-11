import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCodexSpawnEnv,
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

test('readLiveRateLimits prefers wham usage when ChatGPT auth is available', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-auth-'));
  const authFilePath = path.join(tempDir, 'auth.json');
  const payload = {
    rate_limit: {
      primary_window: {
        used_percent: 15,
        limit_window_seconds: 18_000,
        reset_at: 1791234567
      },
      secondary_window: {
        used_percent: 69,
        limit_window_seconds: 604_800,
        reset_at: 1791235567
      }
    },
    spend_control: {
      individual_limit: {
        remaining_percent: 88,
        reset_at: 1791235567
      }
    },
    plan_type: 'plus'
  };
  fs.writeFileSync(authFilePath, JSON.stringify({
    auth_mode: 'chatgpt',
    tokens: {
      access_token: 'test-access-token',
      account_id: 'acct-test-123'
    }
  }));

  try {
    const calls = [];
    const result = await readLiveRateLimits({
      authFilePath,
      timeoutMs: 1000,
      fetchImpl: async (url, options) => {
        calls.push({
          url,
          headers: options.headers
        });

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

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://chatgpt.com/backend-api/wham/usage');
    assert.equal(calls[0].headers.authorization, 'Bearer test-access-token');
    assert.equal(calls[0].headers['ChatGPT-Account-Id'], 'acct-test-123');
    assert.equal(result.sourceOrigin, 'wham_usage');
    assert.equal(result.primary.remainingPercent, 85);
    assert.equal(result.secondary.remainingPercent, 31);
    assert.equal(result.individualLimit.remainingPercent, 88);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
