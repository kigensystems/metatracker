import { Box, Tooltip, Typography } from '@mui/material';
import { FIGURE } from '../lib/theme';
import type { DataFreshness } from '../lib/types';

interface FreshnessBarProps {
  freshness: DataFreshness | null;
}

function formatDateTime(value: string | number | null | undefined): string {
  if (!value) return 'Unknown';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatRelativeTime(value: string | number | null | undefined): string {
  if (!value) return 'Unknown';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) return 'Unknown';

  const diffMins = Math.max(0, Math.floor(diffMs / 60000));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatSnapshotDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function FreshnessBar({ freshness }: FreshnessBarProps) {
  if (!freshness) return null;

  const capturedOrFetchedAt = freshness.capturedAt || freshness.fetchedAt;
  const isHistorical = freshness.source === 'historical';
  const statusColor = freshness.isStale ? 'warning.main' : isHistorical ? 'text.secondary' : 'primary.main';
  const statusLabel = freshness.isStale
    ? 'Older than expected'
    : isHistorical
      ? 'Saved snapshot'
      : 'Up to date';
  const executionDelta = freshness.latestDuneExecutionEndedAt
    && freshness.duneExecutionEndedAt
    && freshness.latestDuneExecutionEndedAt !== freshness.duneExecutionEndedAt
    ? 'Newer Dune result available'
    : null;

  return (
    <Box
      sx={{
        mt: 1,
        py: 1.1,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: 1,
        flexDirection: { xs: 'column', sm: 'row' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Box
          aria-hidden="true"
          sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: statusColor, flexShrink: 0 }}
        />
        <Tooltip title={`Captured ${formatDateTime(capturedOrFetchedAt)}`} arrow>
          <Typography sx={{ ...FIGURE, fontSize: '0.72rem', color: 'text.secondary' }}>
            <Box component="span" sx={{ color: statusColor, fontWeight: 500 }}>
              {statusLabel}
            </Box>
            {' · '}{formatRelativeTime(capturedOrFetchedAt)}
            {freshness.snapshotDate ? ` · ${formatSnapshotDate(freshness.snapshotDate)}` : ''}
          </Typography>
        </Tooltip>
      </Box>

      <Box sx={{ minWidth: 0, textAlign: { xs: 'left', sm: 'right' } }}>
        <Typography
          sx={{
            ...FIGURE,
            fontSize: '0.7rem',
            color: 'text.disabled',
            display: 'block',
          }}
        >
          Dune data {formatRelativeTime(freshness.duneExecutionEndedAt)}
          {freshness.totalCount !== null ? ` · ${freshness.totalCount} tokens` : ''}
          {freshness.enrichment && freshness.enrichment.failedCount > 0
            ? ` · ${freshness.enrichment.failedCount} missing Dex profiles`
            : ''}
        </Typography>
        {(freshness.staleReason || executionDelta) && (
          <Typography
            variant="caption"
            sx={{
              color: 'warning.main',
              opacity: 0.85,
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: { xs: 'normal', md: 'nowrap' },
              maxWidth: { md: 520 },
            }}
          >
            {freshness.staleReason || 'A newer source result is available.'}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
