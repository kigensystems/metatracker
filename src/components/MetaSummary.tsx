import { Box, Typography } from '@mui/material';
import type { GraduatedToken } from '../lib/types';
import { changeColor, formatPercent, formatUsd } from '../lib/format';

interface MetaSummaryProps {
  topVolume: GraduatedToken | null;
  topGainer: GraduatedToken | null;
  topMarketCap: GraduatedToken | null;
  totalVolume: number;
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
        p: { xs: 1.5, sm: 2 },
        borderColor: 'divider',
        minWidth: 0,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background-color 0.15s',
        '&:nth-of-type(odd)': { borderRight: { xs: 1, md: 0 } },
        '&:nth-of-type(-n+2)': { borderBottom: { xs: 1, md: 0 } },
        '&:not(:last-of-type)': { borderRight: { md: 1 } },
        ...(interactive && {
          '&:hover': { backgroundColor: 'action.hover' },
        }),
      }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontWeight: 650,
          fontSize: { xs: '1.1rem', sm: '1.25rem' },
          lineHeight: 1.1,
          color: valueColor || 'text.primary',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.025em',
          mt: 0.75,
        }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          display: 'block',
          mt: 0.55,
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
  topMarketCap,
  totalVolume,
  tokenCount,
  onSelect,
}: MetaSummaryProps) {
  const gainerValue = topGainer?.priceChange24h;

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.25 }}>
        <Typography variant="h6" sx={{ fontSize: '1rem' }}>
          Snapshot overview
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Quick read
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          border: 1,
          borderColor: 'divider',
          borderRadius: 1.5,
          overflow: 'hidden',
          backgroundColor: 'background.paper',
        }}
      >
        <SummaryCard
          label="Most active"
          value={formatUsd(topVolume?.volume24h)}
          sub={topVolume?.name || '—'}
          onClick={topVolume ? () => onSelect(topVolume) : undefined}
        />
        <SummaryCard
          label="Biggest 24h mover"
          value={formatPercent(gainerValue)}
          valueColor={changeColor(gainerValue)}
          sub={topGainer?.name || '—'}
          onClick={topGainer ? () => onSelect(topGainer) : undefined}
        />
        <SummaryCard
          label="Largest Dune estimate"
          value={formatUsd(topMarketCap?.marketCap)}
          sub={topMarketCap?.name || '—'}
          onClick={topMarketCap ? () => onSelect(topMarketCap) : undefined}
        />
        <SummaryCard
          label="Combined Dex volume"
          value={formatUsd(totalVolume)}
          sub={`${tokenCount} launch${tokenCount === 1 ? '' : 'es'}`}
        />
      </Box>
    </Box>
  );
}
