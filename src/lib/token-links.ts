// What a row can link straight out to, and what it should be called.

import type { GraduatedToken } from './types';
import { safeExternalUrl } from './external-url';

export interface TokenLink {
  /** Shown on the row. Names the destination, not the field it came from. */
  label: string;
  url: string;
  title: string;
}

/**
 * Hosts DexScreener hands back in the `website` slot that are not the token's
 * own site. A pump.fun coin page is the launch venue every token here shares,
 * and a generic exchange landing page says nothing about the project — calling
 * either one "site" sends you somewhere useless.
 */
const NOT_A_PROJECT_SITE = [
  'pump.fun',
  'www.pump.fun',
  'dexscreener.com',
];

function isProjectSite(url: string): boolean {
  try {
    return !NOT_A_PROJECT_SITE.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Only links that actually go somewhere. Coverage is thin and uneven — of a
 * typical snapshot roughly a sixth have a site and a third have an X account —
 * so the row renders what exists rather than reserving dead slots.
 */
export function tokenLinks(token: GraduatedToken): TokenLink[] {
  const links: TokenLink[] = [];

  // Website first: it is the thing worth opening, and often the TikTok, X or
  // Instagram post the meme actually came from.
  const site = safeExternalUrl(token.website);
  if (site && isProjectSite(site)) {
    links.push({ label: 'Website', url: site, title: site });
  }

  const chart = safeExternalUrl(token.dexScreenerUrl || token.links.dexscreener);
  if (chart) {
    links.push({ label: 'DexScreener', url: chart, title: `${token.symbol} on DexScreener` });
  }

  const x = safeExternalUrl(token.twitter);
  if (x) {
    links.push({ label: 'X', url: x, title: `${token.symbol} on X` });
  }

  return links;
}
