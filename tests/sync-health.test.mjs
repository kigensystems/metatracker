import { strict as assert } from 'node:assert';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const helperUrl = pathToFileURL('/tmp/metatracker-health-test/sync-health.js').href;
const {
  buildExpectedSlotStatuses,
  getMissingDueSlots,
  getRecentExpectedSlots,
  getScheduledSlot,
  isHealthOk,
} = await import(helperUrl);

function run(slot, status, startedAt, extra = {}) {
  return {
    slot,
    status,
    startedAt: new Date(startedAt).getTime(),
    ...extra,
  };
}

test('maps timestamps to the expected 00:00 or 12:00 UTC cron slot', () => {
  assert.deepEqual(getScheduledSlot(new Date('2026-06-17T11:59:59.000Z')), {
    slot: '2026-06-17T00:00:00.000Z',
    slotDate: '2026-06-17',
    slotHour: 0,
  });

  assert.deepEqual(getScheduledSlot(new Date('2026-06-17T12:00:00.000Z')), {
    slot: '2026-06-17T12:00:00.000Z',
    slotDate: '2026-06-17',
    slotHour: 12,
  });
});

test('applies the 30 minute grace window before a slot is due', () => {
  const beforeCutoff = getRecentExpectedSlots(new Date('2026-06-17T12:29:59.000Z'), 1)[0];
  assert.equal(beforeCutoff.slot, '2026-06-17T12:00:00.000Z');
  assert.equal(beforeCutoff.cutoffAt, '2026-06-17T12:30:00.000Z');
  assert.equal(beforeCutoff.due, false);

  const atCutoff = getRecentExpectedSlots(new Date('2026-06-17T12:30:00.000Z'), 1)[0];
  assert.equal(atCutoff.due, true);
});

test('does not mark old pre-monitoring slots as missing after the first recorded run', () => {
  const now = new Date('2026-06-17T12:45:00.000Z');
  const expectedSlots = getRecentExpectedSlots(now, 4);
  const firstRun = run('2026-06-17T12:00:00.000Z', 'success', '2026-06-17T12:08:00.000Z');

  const expected = buildExpectedSlotStatuses(expectedSlots, [firstRun], firstRun);
  const missing = getMissingDueSlots(expected);

  assert.equal(isHealthOk(firstRun, missing), true);
  assert.equal(missing.length, 0);
  assert.equal(expected.find((slot) => slot.slot === '2026-06-17T00:00:00.000Z').monitored, false);
});

test('is unhealthy until at least one sync run has been recorded', () => {
  const now = new Date('2026-06-17T12:45:00.000Z');
  const expectedSlots = getRecentExpectedSlots(now, 4);
  const expected = buildExpectedSlotStatuses(expectedSlots, [], null);
  const missing = getMissingDueSlots(expected);

  assert.equal(missing.length, 0);
  assert.equal(isHealthOk(null, missing), false);
});

test('marks a monitored due slot missing when no successful run exists', () => {
  const now = new Date('2026-06-17T12:45:00.000Z');
  const expectedSlots = getRecentExpectedSlots(now, 4);
  const firstRun = run('2026-06-17T00:00:00.000Z', 'success', '2026-06-17T00:05:00.000Z');

  const expected = buildExpectedSlotStatuses(expectedSlots, [firstRun], firstRun);
  const missing = getMissingDueSlots(expected);

  assert.equal(isHealthOk(firstRun, missing), false);
  assert.deepEqual(missing.map((slot) => slot.slot), ['2026-06-17T12:00:00.000Z']);
});

test('keeps a slot healthy when one run succeeded even if a later retry failed', () => {
  const now = new Date('2026-06-17T12:45:00.000Z');
  const expectedSlots = getRecentExpectedSlots(now, 1);
  const success = run('2026-06-17T12:00:00.000Z', 'success', '2026-06-17T12:05:00.000Z');
  const failure = run('2026-06-17T12:00:00.000Z', 'failed', '2026-06-17T12:20:00.000Z');

  const expected = buildExpectedSlotStatuses(expectedSlots, [success, failure], success);
  const missing = getMissingDueSlots(expected);

  assert.equal(expected[0].status, 'failed');
  assert.equal(expected[0].hasSuccess, true);
  assert.equal(isHealthOk(success, missing), true);
});
