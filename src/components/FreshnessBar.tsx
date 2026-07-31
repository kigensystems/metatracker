import { Box, Tooltip, Typography } from '@mui/material';
import { formatDateTime, formatRelativeTime, formatSnapshotDate } from '../lib/format';
import { FIGURE } from '../lib/theme';
import type { DataFreshness } from '../lib/types';

interface FreshnessBarProps {
  freshness: DataFreshness | null;
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
          {freshness.totalCount !== null ? `${freshness.totalCount} tokens` : ''}
          {freshness.enrichment && freshness.enrichment.failedCount > 0
            ? ` · ${freshness.enrichment.failedCount} missing Dex profiles`
            : ''}
        </Typography>
        {freshness.staleReason && (
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
            {freshness.staleReason}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
