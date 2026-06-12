import { createSnapshotSourceRouter } from '../src/session/snapshot-source-router.js';
import { readLiveRateLimits } from '../src/session/codex-rate-limit-reader.js';
import { buildRefreshErrorRecord } from '../src/utils/refresh-error-trace.js';

const cwd = process.cwd();
const report = {
  at: new Date().toISOString(),
  cwd
};

async function readLiveSource() {
  try {
    const result = await readLiveRateLimits({
      cwd,
      sourcePreference: 'auto'
    });

    return {
      ok: true,
      result
    };
  } catch (error) {
    return {
      ok: false,
      error: buildRefreshErrorRecord({
        stage: 'debug-live',
        source: 'manual',
        error,
        context: {
          cwd,
          sourcePreference: 'auto'
        }
      })
    };
  }
}

async function readSnapshotSource() {
  try {
    const router = createSnapshotSourceRouter({
      cwd,
      baseDir: cwd
    });
    const result = await router.readSnapshot();

    return {
      ok: true,
      result
    };
  } catch (error) {
    return {
      ok: false,
      error: buildRefreshErrorRecord({
        stage: 'debug-snapshot',
        source: 'manual',
        error,
        context: {
          cwd
        }
      })
    };
  }
}

report.live = await readLiveSource();
report.snapshot = await readSnapshotSource();

console.log(JSON.stringify(report, null, 2));
