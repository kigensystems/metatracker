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
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function DatePicker({
  selectedDate,
  availableDates,
  onDateChange,
  isLoading = false,
  liveDataDate,
}: DatePickerProps) {
  const isToday = selectedDate === null;
  const today = liveDataDate || new Date().toISOString().split('T')[0];

  const historicalDates = availableDates
    .filter(d => d.tokenCount > 0 && d.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  const todayData = availableDates.find(d => d.date === today);
  const todayCount = todayData?.tokenCount;

  return (
    <Box sx={{ mb: 3 }}>
      <ButtonGroup
        variant="outlined"
        size="small"
        sx={{
          '& .MuiButtonGroup-grouped': {
            borderColor: 'divider',
            '&:hover': {
              borderColor: 'divider',
              backgroundColor: 'action.hover',
            },
          },
        }}
      >
        {/* Today tab */}
        <Button
          onClick={() => onDateChange(null)}
          disabled={isLoading}
          sx={{
            px: 2,
            py: 0.75,
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.8125rem',
            ...(isToday
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
          Today
          {todayCount !== undefined && (
            <Typography
              component="span"
              sx={{
                ml: 0.75,
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                opacity: 0.7,
              }}
            >
              {todayCount}
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
