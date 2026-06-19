import { Box, Chip, Tooltip, Typography } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import HistoryIcon from '@mui/icons-material/History';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
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

function sourceLabel(source: string | null): string {
  if (source === 'cache') return 'Fresh cache';
  if (source === 'cache-stale') return 'Stale cache';
  if (source === 'live') return 'Live fetch';
  if (source === 'historical') return 'Historical';
  return 'Data source';
}

export function FreshnessBar({ freshness }: FreshnessBarProps) {
  if (!freshness) return null;

  const capturedOrFetchedAt = freshness.capturedAt || freshness.fetchedAt;
  const statusColor = freshness.isStale ? 'warning.main' : 'primary.main';
  const executionDelta = freshness.latestDuneExecutionEndedAt
    && freshness.duneExecutionEndedAt
    && freshness.latestDuneExecutionEndedAt !== freshness.duneExecutionEndedAt
    ? 'Newer Dune result available'
    : null;

  return (
    <Box
      sx={{
        mb: 3,
        p: 1.5,
        border: 1,
        borderColor: freshness.isStale ? 'warning.main' : 'divider',
        borderRadius: 1,
        backgroundColor: freshness.isStale
          ? 'rgba(245, 158, 11, 0.08)'
          : 'rgba(24, 24, 27, 0.62)',
        display: 'flex',
        alignItems: { xs: 'flex-start', md: 'center' },
        justifyContent: 'space-between',
        gap: 1.5,
        flexDirection: { xs: 'column', md: 'row' },
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Chip
          size="small"
          icon={freshness.isStale ? <ReportProblemIcon /> : <CloudDoneIcon />}
          label={sourceLabel(freshness.source)}
          sx={{
            color: statusColor,
            borderColor: statusColor,
            '& .MuiChip-icon': { color: statusColor },
          }}
          variant="outlined"
        />

        {freshness.snapshotDate && (
          <Tooltip title="Snapshot date" arrow>
            <Chip
              size="small"
              icon={<HistoryIcon />}
              label={freshness.snapshotDate}
              variant="outlined"
              sx={{ color: 'text.secondary', '& .MuiChip-icon': { color: 'text.secondary' } }}
            />
          </Tooltip>
        )}

        <Tooltip title={`Captured ${formatDateTime(capturedOrFetchedAt)}`} arrow>
          <Chip
            size="small"
            icon={<AccessTimeIcon />}
            label={formatRelativeTime(capturedOrFetchedAt)}
            variant="outlined"
            sx={{ color: 'text.secondary', '& .MuiChip-icon': { color: 'text.secondary' } }}
          />
        </Tooltip>

        {freshness.enrichment && (
          <Tooltip
            title={`${freshness.enrichment.failedCount} token enrichments failed`}
            arrow
          >
            <Chip
              size="small"
              label={`Dex ${freshness.enrichment.successRate.toFixed(0)}%`}
              variant="outlined"
              sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
            />
          </Tooltip>
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            color: freshness.isStale ? 'warning.main' : 'text.secondary',
            display: 'block',
            textAlign: { xs: 'left', md: 'right' },
          }}
        >
          Dune execution {formatRelativeTime(freshness.duneExecutionEndedAt)}
          {freshness.totalCount !== null ? ` · ${freshness.totalCount} tokens` : ''}
        </Typography>
        {(freshness.staleReason || executionDelta) && (
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              display: 'block',
              textAlign: { xs: 'left', md: 'right' },
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: { xs: 'normal', md: 'nowrap' },
              maxWidth: { md: 520 },
            }}
          >
            {freshness.staleReason || executionDelta}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
