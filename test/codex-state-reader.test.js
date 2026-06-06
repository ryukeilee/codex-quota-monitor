import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterCodexThreads,
  buildSnapshotFromThreads
} from '../src/session/codex-state-reader.js';

test('filterCodexThreads keeps user threads and drops guardian subagent noise', () => {
  const filtered = filterCodexThreads([
    {
      source: 'vscode',
      threadSource: 'user',
      title: '制作Codex剩余额度工具',
      model: 'gpt-5.4',
      reasoningEffort: 'medium',
      tokensUsed: 5566151,
      updatedAtMs: 1780689736994
    },
    {
      source: '{"subagent":{"other":"guardian"}}',
      threadSource: 'subagent',
      title: 'The following is the Codex agent history whose request action you are assessing.',
      model: 'gpt-5.4',
      reasoningEffort: 'medium',
      tokensUsed: 31767,
      updatedAtMs: 1780684417000
    }
  ]);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].title, '制作Codex剩余额度工具');
});

test('buildSnapshotFromThreads turns real codex threads into a local snapshot with configured budget', () => {
  const snapshot = buildSnapshotFromThreads({
    threads: [
      {
        id: 'thread-1',
        title: '制作Codex剩余额度工具',
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        tokensUsed: 5566151,
        createdAtMs: Date.parse('2026-06-06T03:00:00.000Z'),
        updatedAtMs: Date.parse('2026-06-06T04:02:16.000Z')
      },
      {
        id: 'thread-2',
        title: '降低推理额度消耗',
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        tokensUsed: 40053,
        createdAtMs: Date.parse('2026-06-04T17:00:00.000Z'),
        updatedAtMs: Date.parse('2026-06-04T17:58:53.000Z')
      }
    ],
    budgetLimit: 10000000
  });

  assert.equal(snapshot.sourceLabel, 'local-codex-session-state');
  assert.equal(snapshot.limit, 10000000);
  assert.equal(snapshot.records.length, 2);
  assert.equal(snapshot.records[0].threadId, 'thread-1');
  assert.equal(snapshot.records[0].amount, 5566151);
  assert.equal(snapshot.records[0].totalTokens, 5566151);
  assert.equal(snapshot.records[0].model, 'gpt-5.4');
  assert.equal(snapshot.records[0].intensity, 'medium');
  assert.equal(snapshot.records[0].title, '制作Codex剩余额度工具');
});
