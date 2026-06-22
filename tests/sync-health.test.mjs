import { strict as assert } from 'node:assert';
import test from 'node:test';

const helperUrl = new URL('../node_modules/.cache/health-test/sync-health.js', import.meta.url).href;
const {
  SYNC_INTERVAL_MS,
  SYNC_STALE_AFTER_MS,
  getScheduledSlot,
  getLatestSuccessfulRun,
  getSyncAgeMs,
  isHealthOk,
} = await import(helperUrl);

function run(status, startedAt, slot = '2026-06-17T12:00:00.000Z') {
  return { slot, status, startedAt: new Date(startedAt).getTime() };
}

test('buckets timestamps into 2-hour cron slots', () => {
  assert.deepEqual(getScheduledSlot(new Date('2026-06-17T13:59:59.000Z')), {
    slot: '2026-06-17T12:00:00.000Z',
    slotDate: '2026-06-17',
    slotHour: 12,
  });

  assert.deepEqual(getScheduledSlot(new Date('2026-06-17T14:00:00.000Z')), {
    slot: '2026-06-17T14:00:00.000Z',
    slotDate: '2026-06-17',
    slotHour: 14,
  });

  assert.deepEqual(getScheduledSlot(new Date('2026-06-17T01:30:00.000Z')), {
    slot: '2026-06-17T00:00:00.000Z',
    slotDate: '2026-06-17',
    slotHour: 0,
  });
});

test('finds the most recent successful run regardless of order', () => {
  const latest = getLatestSuccessfulRun([
    run('failed', '2026-06-17T14:00:00.000Z'),
    run('success', '2026-06-17T12:00:00.000Z'),
    run('success', '2026-06-17T10:00:00.000Z'),
    run('running', '2026-06-17T16:00:00.000Z'),
  ]);

  assert.equal(latest.startedAt, new Date('2026-06-17T12:00:00.000Z').getTime());
});

test('returns null when no successful run exists', () => {
  assert.equal(
    getLatestSuccessfulRun([
      run('failed', '2026-06-17T14:00:00.000Z'),
      run('running', '2026-06-17T12:00:00.000Z'),
    ]),
    null,
  );
});

test('is unhealthy until a successful run is recorded', () => {
  assert.equal(isHealthOk(null, Date.parse('2026-06-17T14:00:00.000Z')), false);
});

test('is healthy when the last success is within the stale window', () => {
  const now = Date.parse('2026-06-17T14:35:00.000Z');
  const success = run('success', '2026-06-17T14:00:00.000Z');
  assert.equal(isHealthOk(success, now), true);
  assert.equal(getSyncAgeMs(success, now), 35 * 60 * 1000);
});

test('tolerates a single missed run but flags a sustained outage', () => {
  const success = run('success', '2026-06-17T10:00:00.000Z');
  const base = Date.parse('2026-06-17T10:00:00.000Z');

  // ~2.5h later (one missed 2h slot) is still within the window.
  assert.equal(isHealthOk(success, base + SYNC_INTERVAL_MS + 30 * 60 * 1000), true);

  // Past two intervals + grace, the scheduler is considered stalled.
  assert.equal(isHealthOk(success, base + SYNC_STALE_AFTER_MS + 60 * 1000), false);
});
