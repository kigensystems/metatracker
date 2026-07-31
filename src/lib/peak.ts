// The product's qualifying bar: graduated *and* a defensible observed peak of
// roughly $100k. Everything here is about reading that one question off a row.

import type { GraduatedToken } from './types';

export const PEAK_THRESHOLD = 100_000;

/**
 * `observedPeakCandleInterval` for a peak the venue reported itself, as opposed
 * to one derived from a bounded candle window. Only the reported kind is a true
 * all-time high, so only it may be labelled ATH.
 */
export const REPORTED_PEAK_INTERVAL = 'reported';

export type PeakState =
  /** Read, and it cleared the bar. */
  | { kind: 'cleared'; value: number }
  /** Read, but it never got there. */
  | { kind: 'below'; value: number }
  /**
   * No reading. pump.fun reports an all-time high with the token itself, so a
   * missing peak is now genuinely missing rather than pending — only the venue
   * omitting the figure, or a row captured before the peak was carried, gets
   * here.
   */
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

  return { kind: 'unread' };
}
