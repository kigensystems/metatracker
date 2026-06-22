import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import BarChartIcon from '@mui/icons-material/BarChart';
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
  icon: ReactNode;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
  sub: string;
  onClick?: () => void;
}

function SummaryCard({ icon, iconColor, label, value, valueColor, sub, onClick }: CardProps) {
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
        p: 1.75,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        backgroundColor: 'background.paper',
        minWidth: 0,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'border-color 0.15s, background-color 0.15s',
        ...(interactive && {
          '&:hover': { borderColor: 'text.disabled', backgroundColor: 'action.hover' },
        }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <Box sx={{ color: iconColor, display: 'flex' }}>{icon}</Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
          {label}
        </Typography>
      </Box>
      <Typography
        sx={{
          fontFamily: 'monospace',
          fontWeight: 700,
          fontSize: '1.25rem',
          lineHeight: 1.1,
          color: valueColor || 'text.primary',
        }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
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
  topMarketCap,
  totalVolume,
  tokenCount,
  onSelect,
}: MetaSummaryProps) {
  const iconSx = { fontSize: 18 };
  const gainerValue = topGainer?.priceChange24h;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        gap: 1.5,
        mb: 3,
      }}
    >
      <SummaryCard
        icon={<LocalFireDepartmentIcon sx={iconSx} />}
        iconColor="warning.main"
        label="Top volume"
        value={formatUsd(topVolume?.volume24h)}
        sub={topVolume?.name || '—'}
        onClick={topVolume ? () => onSelect(topVolume) : undefined}
      />
      <SummaryCard
        icon={<TrendingUpIcon sx={iconSx} />}
        iconColor="primary.main"
        label="Top gainer (24h)"
        value={formatPercent(gainerValue)}
        valueColor={changeColor(gainerValue)}
        sub={topGainer?.name || '—'}
        onClick={topGainer ? () => onSelect(topGainer) : undefined}
      />
      <SummaryCard
        icon={<EmojiEventsIcon sx={iconSx} />}
        iconColor="secondary.main"
        label="Top market cap"
        value={formatUsd(topMarketCap?.marketCap)}
        sub={topMarketCap?.name || '—'}
        onClick={topMarketCap ? () => onSelect(topMarketCap) : undefined}
      />
      <SummaryCard
        icon={<BarChartIcon sx={iconSx} />}
        iconColor="info.main"
        label="Total 24h volume"
        value={formatUsd(totalVolume)}
        sub={`across ${tokenCount} launch${tokenCount === 1 ? '' : 'es'}`}
      />
    </Box>
  );
}
