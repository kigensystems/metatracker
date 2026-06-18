import { strict as assert } from 'node:assert';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const retryUrl = pathToFileURL('/tmp/metatracker-health-test/retry.js').href;
const tokenSyncUrl = pathToFileURL('/tmp/metatracker-health-test/token-sync.js').href;

const { withRetries } = await import(retryUrl);
const { validateDuneResultCompleteness } = await import(tokenSyncUrl);

function duneResult({ tokens = [{}], rowCount = tokens.length, totalRowCount = rowCount, state = 'QUERY_STATE_COMPLETED' } = {}) {
  return {
    tokens,
    executionEndedAt: '2026-06-17T12:00:00.000Z',
    sourceMetadata: {
      queryId: '4124453',
      executionEndedAt: '2026-06-17T12:00:00.000Z',
      state,
      responseStatusCode: 200,
      rowCount,
      totalRowCount,
      resultSizeBytes: 123,
      fetchedAt: Date.now(),
      sourceQueryKind: 'latest',
    },
  };
}

test('withRetries retries bounded transient failures', async () => {
  let attempts = 0;
  const result = await withRetries(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('temporary');
      return 'ok';
    },
    { attempts: 3, initialDelayMs: 0 },
  );

  assert.equal(result.value, 'ok');
  assert.equal(result.attempts, 3);
  assert.equal(result.retryCount, 2);
});

test('withRetries stops when shouldRetry rejects the error', async () => {
  let attempts = 0;
  await assert.rejects(
    () => withRetries(
      async () => {
        attempts += 1;
        throw new Error('permanent');
      },
      {
        attempts: 3,
        initialDelayMs: 0,
        shouldRetry: () => false,
      },
    ),
    /permanent/,
  );

  assert.equal(attempts, 1);
});

test('Dune result guard rejects empty results', () => {
  assert.throws(
    () => validateDuneResultCompleteness(duneResult({ tokens: [], rowCount: 0, totalRowCount: 0 })),
    /0 usable tokens/,
  );
});

test('Dune result guard rejects partial pages', () => {
  assert.throws(
    () => validateDuneResultCompleteness(duneResult({ tokens: [{}], rowCount: 1, totalRowCount: 2 })),
    /partial page/,
  );
});

test('Dune result guard rejects malformed token rows', () => {
  assert.throws(
    () => validateDuneResultCompleteness(duneResult({ tokens: [{}], rowCount: 2, totalRowCount: 2 })),
    /usable token rows/,
  );
});
