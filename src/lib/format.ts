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

// Absolute creation time, e.g. "Jun 22, 2:30 PM" — the companion to formatAge.
export function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: value >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100_000 ? 1 : 0,
  }).format(value);
}
