import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRuntimeRoots } from '../src/core/runtime-roots.js';

test('resolveRuntimeRoots keeps Electron app storage aligned with the workspace root', () => {
  const roots = resolveRuntimeRoots({
    runtimeConfig: {
      workspaceRoot: '/Users/ryukeili/Desktop/codex github/codex剩余额度小工具'
    },
    fallbackRoot: '/tmp/fallback-root'
  });

  assert.equal(roots.workspaceRoot, '/Users/ryukeili/Desktop/codex github/codex剩余额度小工具');
  assert.equal(roots.storageRoot, roots.workspaceRoot);
});

test('resolveRuntimeRoots falls back to the provided root when runtime config is missing', () => {
  const roots = resolveRuntimeRoots({
    fallbackRoot: '/tmp/fallback-root'
  });

  assert.equal(roots.workspaceRoot, '/tmp/fallback-root');
  assert.equal(roots.storageRoot, '/tmp/fallback-root');
});
