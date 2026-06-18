import { strict as assert } from 'node:assert';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const helperUrl = pathToFileURL('/tmp/metatracker-health-test/token-dates.js').href;
const {
  buildTokenDateCounts,
  filterTokensByDisplayDate,
  getTokenDisplayDate,
} = await import(helperUrl);

test('formats token dates in the same Pacific timezone shown in rows', () => {
  assert.equal(
    getTokenDisplayDate(Date.parse('2026-06-17T00:30:00.000Z')),
    '2026-06-16',
  );
});

test('dedupes overlapping snapshots and groups by displayed token date', () => {
  const tokens = [
    {
      mint: 'same',
      createdAt: Date.parse('2026-06-17T14:00:00.000Z'),
      snapshotDate: '2026-06-17',
      snapshotCapturedAt: 10,
    },
    {
      mint: 'same',
      createdAt: Date.parse('2026-06-17T14:00:00.000Z'),
      snapshotDate: '2026-06-18',
      snapshotCapturedAt: 20,
    },
    {
      mint: 'other',
      createdAt: Date.parse('2026-06-17T00:30:00.000Z'),
      snapshotDate: '2026-06-18',
      snapshotCapturedAt: 20,
    },
  ];

  assert.deepEqual(buildTokenDateCounts(tokens), [
    { date: '2026-06-17', tokenCount: 1, capturedAt: 20 },
    { date: '2026-06-16', tokenCount: 1, capturedAt: 20 },
  ]);

  assert.deepEqual(
    filterTokensByDisplayDate(tokens, '2026-06-17').map((token) => token.mint),
    ['same'],
  );
});
