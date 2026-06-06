import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_FIVE_HOUR_BUDGET = 25_071_924;

function toIsoString(timestampMs) {
  return new Date(timestampMs).toISOString();
}

export function filterCodexThreads(threads) {
  return threads.filter((thread) => {
    if (!thread.model || !thread.tokensUsed || thread.tokensUsed <= 0) {
      return false;
    }

    if (thread.threadSource && thread.threadSource !== 'user') {
      return false;
    }

    if (thread.title?.startsWith('The following is the Codex agent history')) {
      return false;
    }

    return thread.source === 'vscode' || thread.source === 'cli' || thread.source == null;
  });
}

export function buildSnapshotFromThreads({ threads, budgetLimit = DEFAULT_FIVE_HOUR_BUDGET }) {
  const filteredThreads = filterCodexThreads(threads).sort((left, right) => right.updatedAtMs - left.updatedAtMs);

  return {
    sourceLabel: 'local-codex-session-state',
    limit: budgetLimit,
    isActive: true,
    isHighIntensity: filteredThreads.some((thread) => thread.reasoningEffort === 'high'),
    records: filteredThreads.map((thread) => ({
      threadId: thread.id,
      at: toIsoString(thread.updatedAtMs),
      createdAt: toIsoString(thread.createdAtMs),
      amount: thread.tokensUsed,
      totalTokens: thread.tokensUsed,
      model: thread.model,
      intensity: thread.reasoningEffort ?? 'medium',
      title: thread.title
    }))
  };
}

export function createCodexStateReader({ fiveHourBudget = DEFAULT_FIVE_HOUR_BUDGET, cwd } = {}) {
  const stateFile = path.join(os.homedir(), '.codex', 'state_5.sqlite');

  return {
    isAvailable() {
      return fs.existsSync(stateFile);
    },
    async readSnapshot() {
      if (!fs.existsSync(stateFile)) {
        return null;
      }

      const database = new DatabaseSync(stateFile, { readOnly: true });
      try {
        const threads = database.prepare(`
          SELECT
            id,
            title,
            source,
            thread_source AS threadSource,
            model,
            reasoning_effort AS reasoningEffort,
            tokens_used AS tokensUsed,
            created_at_ms AS createdAtMs,
            updated_at_ms AS updatedAtMs
          FROM threads
          WHERE model IS NOT NULL AND tokens_used > 0
            AND (? IS NULL OR cwd = ?)
          ORDER BY updated_at_ms DESC
          LIMIT 80
        `).all(cwd ?? null, cwd ?? null);

        return {
          sourceFile: stateFile,
          snapshot: buildSnapshotFromThreads({
            threads,
            budgetLimit: fiveHourBudget
          })
        };
      } finally {
        database.close();
      }
    }
  };
}
