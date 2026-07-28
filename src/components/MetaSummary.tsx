import { Box, Typography } from '@mui/material';
import type { GraduatedToken } from '../lib/types';
import { FIGURE, LABEL } from '../lib/theme';
import { changeColor, formatPercent, formatUsd } from '../lib/format';

interface MetaSummaryProps {
  topVolume: GraduatedToken | null;
  topGainer: GraduatedToken | null;
  topPeak: GraduatedToken | null;
  qualifiedCount: number;
  tokenCount: number;
  onSelect: (token: GraduatedToken) => void;
}

interface CardProps {
  label: string;
  value: string;
  valueColor?: string;
  sub: string;
  onClick?: () => void;
}

function SummaryCard({ label, value, valueColor, sub, onClick }: CardProps) {
  const interactive = Boolean(onClick);
  return (
    <Box
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      sx={{
        p: { xs: 1.5, sm: 1.75 },
        backgroundColor: 'background.paper',
        minWidth: 0,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background-color 0.15s',
        ...(interactive && {
          '&:hover': { backgroundColor: 'action.hover' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        }),
      }}
    >
      <Typography sx={{ ...LABEL, color: 'text.secondary' }}>{label}</Typography>
      <Typography
        sx={{
          ...FIGURE,
          fontWeight: 500,
          fontSize: { xs: '1.15rem', sm: '1.3rem' },
          lineHeight: 1.15,
          color: valueColor || 'text.primary',
          mt: 0.75,
        }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: 'text.disabled',
          display: 'block',
          mt: 0.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {sub}
      </Typography>
    </Box>
  );
}

export function MetaSummary({
  topVolume,
  topGainer,
  topPeak,
  qualifiedCount,
  tokenCount,
  onSelect,
}: MetaSummaryProps) {
  const gainerValue = topGainer?.priceChange24h;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        // Hairlines as grid gaps: they stay true however the cards wrap.
        gap: '1px',
        backgroundColor: 'divider',
        border: 1,
        borderColor: 'divider',
        borderRadius: 0.5,
        overflow: 'hidden',
        mb: 3,
      }}
    >
      <SummaryCard
        label="Cleared $100K"
        value={`${qualifiedCount}`}
        valueColor={qualifiedCount > 0 ? 'primary.main' : 'text.disabled'}
        sub={`of ${tokenCount} graduate${tokenCount === 1 ? '' : 's'}`}
      />
      <SummaryCard
        label="Highest peak"
        value={formatUsd(topPeak?.observedPeakMarketCap)}
        sub={topPeak?.name || 'None read yet'}
        onClick={topPeak ? () => onSelect(topPeak) : undefined}
      />
      <SummaryCard
        label="Most active"
        value={formatUsd(topVolume?.volume24h)}
        sub={topVolume?.name || '—'}
        onClick={topVolume ? () => onSelect(topVolume) : undefined}
      />
      <SummaryCard
        label="Biggest 24h move"
        value={formatPercent(gainerValue)}
        valueColor={changeColor(gainerValue)}
        sub={topGainer?.name || '—'}
        onClick={topGainer ? () => onSelect(topGainer) : undefined}
      />
    </Box>
  );
}
