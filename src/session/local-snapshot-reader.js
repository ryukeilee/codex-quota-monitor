import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FIXTURE = {
  sourceLabel: 'demo-local-snapshot',
  limit: 100,
  isActive: true,
  isHighIntensity: false,
  records: [
    { at: '2026-06-06T01:10:00.000Z', amount: 8, model: 'gpt-5.4', intensity: 'medium' },
    { at: '2026-06-06T02:30:00.000Z', amount: 10, model: 'gpt-5.4', intensity: 'medium' },
    { at: '2026-06-06T03:40:00.000Z', amount: 12, model: 'gpt-5.4', intensity: 'high' },
    { at: '2026-06-06T05:00:00.000Z', amount: 6, model: 'gpt-5.4-mini', intensity: 'low' }
  ]
};

const DEMO_OFFSETS_MS = [
  3 * 60 * 60 * 1000,
  1.5 * 60 * 60 * 1000,
  55 * 60 * 1000,
  20 * 60 * 1000
];

function ensureSnapshotFile(filePath) {
  if (fs.existsSync(filePath)) {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(DEFAULT_FIXTURE, null, 2)}\n`);
}

export function createLocalSnapshotReader(baseDir = process.cwd()) {
  const sourceFile = path.join(baseDir, 'data', 'source-snapshot.json');
  const exampleFile = path.join(baseDir, 'config', 'source-snapshot.example.json');

  ensureSnapshotFile(sourceFile);
  ensureSnapshotFile(exampleFile);

  return {
    isAvailable() {
      return fs.existsSync(sourceFile);
    },
    readSnapshot() {
      const raw = fs.readFileSync(sourceFile, 'utf8');
      const snapshot = normalizeDemoSnapshot(JSON.parse(raw));

      return {
        sourceFile,
        snapshot
      };
    }
  }
}

export function normalizeDemoSnapshot(snapshot, now = new Date()) {
  if (snapshot.sourceLabel !== 'demo-local-snapshot') {
    return snapshot;
  }

  return {
    ...snapshot,
    records: snapshot.records.map((record, index) => ({
      ...record,
      at: new Date(now.getTime() - (DEMO_OFFSETS_MS[index] ?? (10 * 60 * 1000))).toISOString()
    }))
  };
}
