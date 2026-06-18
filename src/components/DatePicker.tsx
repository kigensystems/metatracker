import { Box, Button, ButtonGroup, Typography } from '@mui/material';

interface AvailableDate {
  date: string;
  tokenCount: number;
  capturedAt: number;
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
    .filter(d => d.tokenCount > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  return (
    <Box
      sx={{
        mb: 3,
        overflowX: 'auto',
        pb: 0.5,
      }}
    >
      <ButtonGroup
        variant="outlined"
        size="small"
        sx={{
          minWidth: 'max-content',
          '& .MuiButtonGroup-grouped': {
            borderColor: 'divider',
            whiteSpace: 'nowrap',
            '&:hover': {
              borderColor: 'divider',
              backgroundColor: 'action.hover',
            },
          },
        }}
      >
        {/* Latest rolling 24h tab */}
        <Button
          onClick={() => onDateChange(null)}
          disabled={isLoading}
          title={`Latest rolling 24h snapshot (${formatDate(liveSnapshotDate)})`}
          sx={{
            px: 2,
            py: 0.75,
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.8125rem',
            ...(isLiveSelected
              ? {
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderColor: 'primary.main',
                  color: 'primary.main',
                  '&:hover': {
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    borderColor: 'primary.main',
                  },
                }
              : {
                  color: 'text.secondary',
                }),
          }}
        >
          Latest 24h
          {liveTokenCount !== undefined && (
            <Typography
              component="span"
              sx={{
                ml: 0.75,
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                opacity: 0.7,
              }}
            >
              {liveTokenCount}
            </Typography>
          )}
        </Button>

        {/* Historical date tabs */}
        {historicalDates.map(({ date, tokenCount }) => {
          const isSelected = selectedDate === date;
          return (
            <Button
              key={date}
              onClick={() => onDateChange(date)}
              disabled={isLoading}
              sx={{
                px: 2,
                py: 0.75,
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.8125rem',
                ...(isSelected
                  ? {
                      backgroundColor: 'rgba(167, 139, 250, 0.1)',
                      borderColor: 'secondary.main',
                      color: 'secondary.main',
                      '&:hover': {
                        backgroundColor: 'rgba(167, 139, 250, 0.15)',
                        borderColor: 'secondary.main',
                      },
                    }
                  : {
                      color: 'text.secondary',
                }),
              }}
              title={`Tokens created on ${formatDate(date)}`}
            >
              {formatDate(date)}
              <Typography
                component="span"
                sx={{
                  ml: 0.75,
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  opacity: 0.7,
                }}
              >
                {tokenCount}
              </Typography>
            </Button>
          );
        })}
      </ButtonGroup>
    </Box>
  );
}
