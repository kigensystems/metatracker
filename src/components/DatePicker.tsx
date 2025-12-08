import { motion } from 'framer-motion';
import { Box, Chip, Stack } from '@mui/material';
import TodayIcon from '@mui/icons-material/Today';

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
    .slice(0, 14);

  const todayData = availableDates.find(d => d.date === today);
  const todayCount = todayData?.tokenCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          pb: 1,
          mb: 2,
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {/* Today chip */}
        <Chip
          icon={<TodayIcon sx={{ fontSize: 16 }} />}
          label={
            <Stack direction="row" spacing={0.75} alignItems="center">
              <span>Today</span>
              {todayCount !== undefined && (
                <Box
                  component="span"
                  sx={{
                    fontSize: '0.75rem',
                    opacity: isToday ? 0.8 : 0.5,
                    fontFamily: 'monospace',
                  }}
                >
                  {todayCount}
                </Box>
              )}
            </Stack>
          }
          onClick={() => onDateChange(null)}
          disabled={isLoading}
          variant={isToday ? 'filled' : 'outlined'}
          sx={{
            flexShrink: 0,
            height: 36,
            borderRadius: '18px',
            fontWeight: 500,
            transition: 'all 0.2s ease',
            ...(isToday
              ? {
                  backgroundColor: 'rgba(57, 255, 20, 0.15)',
                  color: 'primary.main',
                  border: '1px solid',
                  borderColor: 'rgba(57, 255, 20, 0.4)',
                  '& .MuiChip-icon': { color: 'primary.main' },
                }
              : {
                  borderColor: 'divider',
                  color: 'text.secondary',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                    color: 'text.primary',
                  },
                }),
          }}
        />

        {/* Historical date chips */}
        {historicalDates.map(({ date, tokenCount }, index) => {
          const isSelected = selectedDate === date;
          return (
            <motion.div
              key={date}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03 }}
            >
              <Chip
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <span>{formatDate(date)}</span>
                    <Box
                      component="span"
                      sx={{
                        fontSize: '0.75rem',
                        opacity: isSelected ? 0.8 : 0.5,
                        fontFamily: 'monospace',
                      }}
                    >
                      {tokenCount}
                    </Box>
                  </Stack>
                }
                onClick={() => onDateChange(date)}
                disabled={isLoading}
                variant={isSelected ? 'filled' : 'outlined'}
                sx={{
                  flexShrink: 0,
                  height: 36,
                  borderRadius: '18px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                  ...(isSelected
                    ? {
                        backgroundColor: 'rgba(170, 85, 255, 0.15)',
                        color: 'secondary.main',
                        border: '1px solid',
                        borderColor: 'rgba(170, 85, 255, 0.4)',
                      }
                    : {
                        borderColor: 'divider',
                        color: 'text.secondary',
                        '&:hover': {
                          backgroundColor: 'action.hover',
                          color: 'text.primary',
                        },
                      }),
                }}
              />
            </motion.div>
          );
        })}
      </Box>
    </motion.div>
  );
}
