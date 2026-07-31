// Shared number/price formatters used across the token list, summary, and drawer.

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(value >= 1 ? 2 : 6)}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  // Wild memecoin swings read better as whole numbers with separators (+2,277%);
  // sub-100 moves keep one decimal (-94.1%).
  const num = abs >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
  return `${value > 0 ? '+' : ''}${num}%`;
}

// MUI color token for a 24h price change: up = green, down = red, unknown = muted.
export function changeColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'text.disabled';
  return value >= 0 ? 'primary.main' : 'error.main';
}

export function formatAge(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return '—';
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

// Absolute creation time, e.g. "Jun 22, 2:30 PM EST" — the companion to
// formatAge. Accepts ISO strings as well: Convex stores some source
// timestamps that way.
export function formatDateTime(value: string | number | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

// "5m ago" — formatAge with a suffix, for freshness copy rather than a column.
export function formatRelativeTime(value: string | number | null | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) return 'Unknown';

  const mins = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// A YYYY-MM-DD snapshot key as "Jun 22". Snapshot dates are UTC days, so the
// label must be too, or the tab flips a day early for anyone west of UTC.
export function formatSnapshotDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: value >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100_000 ? 1 : 0,
  }).format(value);
}
