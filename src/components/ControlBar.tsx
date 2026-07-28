import { Box, Typography } from '@mui/material';
import { DatePicker } from './DatePicker';
import { accentAlpha, FIGURE, LABEL } from '../lib/theme';

interface AvailableDate {
  date: string;
  tokenCount: number;
  capturedAt: number;
  captureMode?: string;
}

interface ControlBarProps {
  selectedDate: string | null;
  availableDates: AvailableDate[];
  onDateChange: (date: string | null) => void;
  isLoading: boolean;
  liveDataDate: string | null;
  liveTokenCount?: number;
  qualifiedOnly: boolean;
  onQualifiedOnlyChange: (value: boolean) => void;
  qualifiedCount: number;
  shownCount: number;
  totalCount: number;
}

/**
 * Which snapshot, and which slice of it — the two questions that change what
 * the table shows, kept together on one line above it.
 */
export function ControlBar({
  selectedDate,
  availableDates,
  onDateChange,
  isLoading,
  liveDataDate,
  liveTokenCount,
  qualifiedOnly,
  onQualifiedOnlyChange,
  qualifiedCount,
  shownCount,
  totalCount,
}: ControlBarProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'stretch', md: 'flex-end' },
        justifyContent: 'space-between',
        flexDirection: { xs: 'column', md: 'row' },
        gap: { xs: 1.5, md: 3 },
        pb: 1.5,
        mb: 2,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <DatePicker
          selectedDate={selectedDate}
          availableDates={availableDates}
          onDateChange={onDateChange}
          isLoading={isLoading}
          liveDataDate={liveDataDate}
          liveTokenCount={liveTokenCount}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
        <Box
          component="button"
          type="button"
          onClick={() => onQualifiedOnlyChange(!qualifiedOnly)}
          aria-pressed={qualifiedOnly}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            height: 30,
            px: 1.25,
            cursor: 'pointer',
            border: 1,
            borderRadius: '2px',
            transition: 'all 0.15s',
            backgroundColor: qualifiedOnly ? accentAlpha(0.09) : 'transparent',
            borderColor: qualifiedOnly ? accentAlpha(0.5) : 'divider',
            color: qualifiedOnly ? 'primary.main' : 'text.secondary',
            '&:hover': { borderColor: qualifiedOnly ? 'primary.main' : 'text.disabled' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
          }}
        >
          <Typography sx={{ ...LABEL, color: 'inherit' }}>Cleared $100K</Typography>
          <Typography sx={{ ...FIGURE, fontSize: '0.7rem', color: 'inherit' }}>
            {qualifiedCount}
          </Typography>
        </Box>

        <Typography
          aria-live="polite"
          sx={{ ...FIGURE, fontSize: '0.7rem', color: 'text.disabled', whiteSpace: 'nowrap' }}
        >
          {shownCount === totalCount ? `${totalCount} tokens` : `${shownCount} of ${totalCount}`}
        </Typography>
      </Box>
    </Box>
  );
}
