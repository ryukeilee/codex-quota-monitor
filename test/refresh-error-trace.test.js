import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRefreshErrorRecord } from '../src/utils/refresh-error-trace.js';

test('buildRefreshErrorRecord captures error details without exposing obvious secrets', () => {
  const error = new Error('request failed for Bearer abc123 token=secret@example.com');
  error.code = 'ECONNRESET';
  error.kind = 'transport';
  error.status = 503;
  error.sourceOrigin = 'wham_usage';

  const entry = buildRefreshErrorRecord({
    stage: 'live-read',
    source: 'manual',
    error,
    fallback: true,
    context: {
      cwd: '/Users/test/project',
      detail: 'cookie=abc'
    }
  });

  assert.equal(entry.stage, 'live-read');
  assert.equal(entry.source, 'manual');
  assert.equal(entry.fallback, true);
  assert.equal(entry.error.name, 'Error');
  assert.match(entry.error.message, /\[REDACTED\]/);
  assert.match(entry.error.stack, /\[REDACTED\]/);
  assert.equal(entry.error.code, 'ECONNRESET');
  assert.equal(entry.error.kind, 'transport');
  assert.equal(entry.error.status, 503);
  assert.equal(entry.error.sourceOrigin, 'wham_usage');
  assert.equal(entry.context.cwd, '/Users/test/project');
  assert.match(entry.context.detail, /\[REDACTED\]/);
});
