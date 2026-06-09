import { createCodexStateReader } from './codex-state-reader.js';
import { createLocalSnapshotReader } from './local-snapshot-reader.js';

export function createSnapshotSourceRouter(options = {}) {
  const readers = [
    createCodexStateReader({
      fiveHourBudget: options.fiveHourBudget,
      cwd: options.cwd
    }),
    createLocalSnapshotReader(options.baseDir)
  ];

  return {
    async readSnapshot() {
      for (const reader of readers) {
        if (!reader.isAvailable()) {
          continue;
        }

        const result = await reader.readSnapshot();
        if (result?.snapshot?.records?.length) {
          return result;
        }
      }

      return createLocalSnapshotReader(options.baseDir).readSnapshot();
    }
  };
}
