import { Box, Button, Typography } from '@mui/material';
import { formatSnapshotDate } from '../lib/format';
import { accentAlpha, FIGURE, inkAlpha, LABEL } from '../lib/theme';

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
      <Typography sx={{ ...LABEL, color: 'text.secondary', display: 'block', mb: 1 }}>
        Snapshot
      </Typography>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          overflowX: 'auto',
          pb: 0.5,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          // Fades the last chip so a scrollable row reads as scrollable.
          maskImage: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)',
          WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)',
        }}
      >
        <Button
          onClick={() => onDateChange(null)}
          disabled={isLoading}
          title={`Latest observed token cohort (${formatSnapshotDate(liveSnapshotDate)})`}
          aria-pressed={isLiveSelected}
          sx={{
            minWidth: 0,
            flexShrink: 0,
            px: 1.5,
            py: 0.6,
            border: 1,
            borderRadius: '2px',
            whiteSpace: 'nowrap',
            fontFamily: FIGURE.fontFamily,
            fontSize: '0.75rem',
            fontWeight: 500,
            ...(isLiveSelected
              ? {
                  backgroundColor: accentAlpha(0.13),
                  borderColor: accentAlpha(0.38),
                  color: 'text.primary',
                  '&:hover': {
                    backgroundColor: accentAlpha(0.19),
                    borderColor: accentAlpha(0.45),
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
                ...FIGURE,
                fontSize: '0.7rem',
                color: 'text.disabled',
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
                py: 0.6,
                border: 1,
                borderRadius: '2px',
                whiteSpace: 'nowrap',
                fontFamily: FIGURE.fontFamily,
                fontSize: '0.75rem',
                fontWeight: 500,
                ...(isSelected
                  ? {
                      backgroundColor: inkAlpha(0.06),
                      borderColor: 'text.disabled',
                      color: 'text.primary',
                      '&:hover': {
                        backgroundColor: inkAlpha(0.09),
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
                ? `All tokens observed in source snapshots on ${formatSnapshotDate(date)}`
                : `Final rolling source snapshot stored on ${formatSnapshotDate(date)}`}
            >
              {formatSnapshotDate(date)}
              <Typography
                component="span"
                sx={{
                  ml: 0.75,
                  display: { xs: 'none', sm: 'inline' },
                  ...FIGURE,
                  fontSize: '0.7rem',
                  color: 'text.disabled',
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
