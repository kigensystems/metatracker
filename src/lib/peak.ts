// The product's qualifying bar: graduated *and* a defensible observed peak of
// roughly $100k. Everything here is about reading that one question off a row.

import type { GraduatedToken } from './types';

export const PEAK_THRESHOLD = 100_000;

/**
 * The peak reader only queues tokens once they are a day old, so a young token
 * with no reading is waiting its turn rather than lacking one.
 *
 * This mirrors `MIN_TOKEN_AGE_MS` in netlify/functions/peak-backfill.ts. The
 * server knows the real reason a reading is missing (too young, retrying, or
 * given up on), but only the peak value itself crosses the API, so the client
 * infers the common case from age. Deliberate: surfacing the full status is
 * more plumbing than this one label is worth. Keep the two constants in step.
 */
const PEAK_ELIGIBLE_AFTER_MS = 24 * 60 * 60 * 1000;

export type PeakState =
  /** Read, and it cleared the bar. */
  | { kind: 'cleared'; value: number }
  /** Read, but it never got there. */
  | { kind: 'below'; value: number }
  /** Too young to have been read yet — absence here is schedule, not evidence. */
  | { kind: 'scheduled' }
  /** Old enough to have been read, and we still have no reading. */
  | { kind: 'unread' };

/**
 * The one qualification question, asked in exactly one place.
 *
 * A live market cap over the bar counts too: a token trading at $400k has
 * demonstrably been worth $400k, and making that wait on a peak reading would
 * leave the freshest runners uncounted for a day.
 */
export function hasClearedPeak(token: GraduatedToken): boolean {
  if (peakState(token).kind === 'cleared') return true;
  return (token.marketCap ?? 0) >= PEAK_THRESHOLD;
}

export function peakState(token: GraduatedToken): PeakState {
  const value = token.observedPeakMarketCap;
  if (value != null) {
    return value >= PEAK_THRESHOLD ? { kind: 'cleared', value } : { kind: 'below', value };
  }

  const age = token.createdAt == null ? null : Date.now() - token.createdAt;
  if (age != null && age < PEAK_ELIGIBLE_AFTER_MS) return { kind: 'scheduled' };
  return { kind: 'unread' };
}
