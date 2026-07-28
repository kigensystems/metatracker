import { Box, Button, Typography } from '@mui/material';

interface AvailableDate {
  date: string;
  tokenCount: number;
  capturedAt: number;
  captureMode?: string;
}

interface DatePickerProps {
  selectedDate: string | null;
  availableDates: AvailableDate[];
  onDateChange: (date: string | null) => void;
  isLoading?: boolean;
  liveDataDate?: string | null;
  liveTokenCount?: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DatePicker({
  selectedDate,
  availableDates,
  onDateChange,
  isLoading = false,
  liveDataDate,
  liveTokenCount,
}: DatePickerProps) {
  const isLiveSelected = selectedDate === null;
  const liveSnapshotDate = liveDataDate || getLocalDateKey();

  const historicalDates = availableDates
    .filter(d => d.tokenCount > 0 && d.date !== liveSnapshotDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  return (
    <Box
      sx={{
        mb: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.25 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 650, color: 'text.primary' }}>
          Snapshot
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Tokens retained from source snapshots
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          overflowX: 'auto',
          pb: 0.5,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        <Button
          onClick={() => onDateChange(null)}
          disabled={isLoading}
          title={`Latest observed token cohort (${formatDate(liveSnapshotDate)})`}
          aria-pressed={isLiveSelected}
          sx={{
            minWidth: 0,
            flexShrink: 0,
            px: 1.5,
            py: 0.65,
            border: 1,
            borderRadius: '999px',
            whiteSpace: 'nowrap',
            fontSize: '0.8rem',
            ...(isLiveSelected
              ? {
                  backgroundColor: 'rgba(114, 211, 140, 0.12)',
                  borderColor: 'rgba(114, 211, 140, 0.34)',
                  color: 'text.primary',
                  '&:hover': {
                    backgroundColor: 'rgba(114, 211, 140, 0.17)',
                    borderColor: 'rgba(114, 211, 140, 0.4)',
                  },
                }
              : {
                  color: 'text.secondary',
                  borderColor: 'divider',
                  '&:hover': { backgroundColor: 'action.hover', borderColor: 'text.disabled' },
                }),
          }}
        >
          Latest
          {liveTokenCount !== undefined && (
            <Typography
              component="span"
              sx={{
                ml: 0.75,
                display: { xs: 'none', sm: 'inline' },
                fontSize: '0.75rem',
                fontVariantNumeric: 'tabular-nums',
                color: 'text.secondary',
              }}
            >
              {liveTokenCount}
            </Typography>
          )}
        </Button>

        {historicalDates.map(({ date, tokenCount, captureMode }) => {
          const isSelected = selectedDate === date;
          return (
            <Button
              key={date}
              onClick={() => onDateChange(date)}
              disabled={isLoading}
              aria-pressed={isSelected}
              sx={{
                minWidth: 0,
                flexShrink: 0,
                px: 1.5,
                py: 0.65,
                border: 1,
                borderRadius: '999px',
                whiteSpace: 'nowrap',
                fontSize: '0.8rem',
                ...(isSelected
                  ? {
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      borderColor: 'text.disabled',
                      color: 'text.primary',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderColor: 'text.secondary',
                      },
                    }
                  : {
                      color: 'text.secondary',
                      borderColor: 'divider',
                      '&:hover': { backgroundColor: 'action.hover', borderColor: 'text.disabled' },
                    }),
              }}
              title={captureMode === 'daily-observed-union'
                ? `All tokens observed in source snapshots on ${formatDate(date)}`
                : `Final rolling source snapshot stored on ${formatDate(date)}`}
            >
              {formatDate(date)}
              <Typography
                component="span"
                sx={{
                  ml: 0.75,
                  display: { xs: 'none', sm: 'inline' },
                  fontSize: '0.75rem',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'text.secondary',
                }}
              >
                {tokenCount}
              </Typography>
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
