import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  normalizeRateLimitsResponse,
  resolveCodexExecutablePath
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
  assert.equal(result.primary.used, 2);
  assert.equal(result.primary.remainingPercent, 98);
  assert.equal(result.primary.presentation, 'percent');
  assert.equal(result.primary.windowState, 'healthy');
  assert.equal(result.primary.nextRecoveryAt, new Date(1791234567 * 1000).toISOString());
  assert.equal(result.secondary.used, 24);
  assert.equal(result.secondary.remainingPercent, 76);
  assert.equal(result.secondary.presentation, 'percent');
  assert.equal(result.secondary.nextRecoveryAt, new Date(1791235567 * 1000).toISOString());
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
