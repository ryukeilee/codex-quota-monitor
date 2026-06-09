import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function serializePreferenceValue(value) {
  return JSON.stringify(value);
}

function parsePreferenceValue(value) {
  return JSON.parse(value);
}

export function createDatabase(baseDir = process.cwd()) {
  const dataDir = path.join(baseDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const database = new DatabaseSync(path.join(dataDir, 'codex-monitor.db'));

  database.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      limit_total INTEGER NOT NULL,
      used_amount INTEGER NOT NULL,
      remaining_amount INTEGER NOT NULL,
      remaining_percent INTEGER NOT NULL,
      window_state TEXT NOT NULL,
      next_recovery_at TEXT,
      source_label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at TEXT NOT NULL,
      amount INTEGER NOT NULL,
      model TEXT NOT NULL,
      intensity TEXT NOT NULL,
      UNIQUE(recorded_at, amount, model, intensity)
    );

    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thread_usage_state (
      thread_id TEXT PRIMARY KEY,
      last_seen_at TEXT NOT NULL,
      last_total_tokens INTEGER NOT NULL
    );
  `);

  return {
    close() {
      database.close();
    },
    clearUsageTracking() {
      database.exec(`
        DELETE FROM usage_records;
        DELETE FROM thread_usage_state;
      `);
    },
    saveSnapshot({ capturedAt, summary, sourceLabel }) {
      database.prepare(`
        INSERT INTO snapshots (
          captured_at,
          limit_total,
          used_amount,
          remaining_amount,
          remaining_percent,
          window_state,
          next_recovery_at,
          source_label
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        capturedAt,
        summary.limit,
        summary.used,
        summary.remaining,
        summary.remainingPercent,
        summary.windowState,
        summary.nextRecoveryAt,
        sourceLabel
      );
    },
    saveUsageRecords(records) {
      const statement = database.prepare(`
        INSERT OR IGNORE INTO usage_records (recorded_at, amount, model, intensity)
        VALUES (?, ?, ?, ?)
      `);

      for (const record of records) {
        statement.run(record.at, record.amount, record.model, record.intensity);
      }
    },
    getRecentSnapshots(limit = 48) {
      return database.prepare(`
        SELECT
          captured_at AS capturedAt,
          remaining_percent AS remainingPercent,
          remaining_amount AS remaining,
          used_amount AS used
        FROM snapshots
        ORDER BY captured_at DESC
        LIMIT ?
      `).all(limit).reverse();
    },
    getRecentSnapshotsSince(since) {
      return database.prepare(`
        SELECT
          captured_at AS capturedAt,
          remaining_percent AS remainingPercent,
          remaining_amount AS remaining,
          used_amount AS used
        FROM snapshots
        WHERE captured_at >= ?
        ORDER BY captured_at ASC
      `).all(since);
    },
    getRecentUsageRecords(limit = 100) {
      return database.prepare(`
        SELECT
          recorded_at AS at,
          amount,
          model,
          intensity
        FROM usage_records
        ORDER BY recorded_at DESC
        LIMIT ?
      `).all(limit).reverse();
    },
    getUsageRecordsSince(since) {
      return database.prepare(`
        SELECT
          recorded_at AS at,
          amount,
          model,
          intensity
        FROM usage_records
        WHERE recorded_at >= ?
        ORDER BY recorded_at ASC
      `).all(since);
    },
    getThreadUsageState(threadIds) {
      if (!threadIds || threadIds.length === 0) {
        return {};
      }

      const placeholders = threadIds.map(() => '?').join(', ');
      const rows = database.prepare(`
        SELECT
          thread_id AS threadId,
          last_seen_at AS lastSeenAt,
          last_total_tokens AS lastTotalTokens
        FROM thread_usage_state
        WHERE thread_id IN (${placeholders})
      `).all(...threadIds);

      return rows.reduce((result, row) => ({
        ...result,
        [row.threadId]: {
          lastSeenAt: row.lastSeenAt,
          lastTotalTokens: row.lastTotalTokens
        }
      }), {});
    },
    upsertThreadUsageState(threadStateById) {
      const statement = database.prepare(`
        INSERT INTO thread_usage_state (thread_id, last_seen_at, last_total_tokens)
        VALUES (?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at,
          last_total_tokens = excluded.last_total_tokens
      `);

      for (const [threadId, threadState] of Object.entries(threadStateById)) {
        statement.run(threadId, threadState.lastSeenAt, threadState.lastTotalTokens);
      }
    },
    getPreferences() {
      const rows = database.prepare(`
        SELECT key, value
        FROM preferences
      `).all();

      return rows.reduce((result, row) => ({
        ...result,
        [row.key]: parsePreferenceValue(row.value)
      }), {});
    },
    upsertPreferences(preferences) {
      const statement = database.prepare(`
        INSERT INTO preferences (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);

      for (const [key, value] of Object.entries(preferences)) {
        statement.run(key, serializePreferenceValue(value));
      }
    }
  };
}
