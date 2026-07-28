import { memo, useState } from 'react';
import { Box, Typography, Avatar } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { GraduatedToken } from '../lib/types';
import { changeColor, formatAge, formatPercent, formatUsd } from '../lib/format';

// Shared column template so the header and every row stay aligned.
// Mobile: token · 24h volume · observed peak · detail affordance.
// Desktop adds Dune market cap and 24h change.
export const ROW_GRID = {
  display: 'grid',
  gridTemplateColumns: {
    xs: 'minmax(0, 1fr) 78px 72px 18px',
    sm: 'minmax(240px, 1.7fr) 110px 110px 110px 100px 24px',
  },
  columnGap: { xs: 0.75, sm: 2 },
  alignItems: 'center',
} as const;

interface TokenRowProps {
  token: GraduatedToken;
  onSelect: (token: GraduatedToken) => void;
}

export const TokenRow = memo(function TokenRow({ token, onSelect }: TokenRowProps) {
  const [imgError, setImgError] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(token);
    }
  };

  const change = token.priceChange24h;

  return (
    <Box
      component="div"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(token)}
      onKeyDown={handleKeyDown}
      sx={{
        ...ROW_GRID,
        px: { xs: 1.25, sm: 2 },
        py: 1.35,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
        borderBottom: 1,
        borderColor: 'divider',
        transition: 'background-color 0.15s',
        '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.035)' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        '&:last-child': { borderBottom: 0 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        {token.image && !imgError ? (
          <Avatar
            src={token.image}
            alt={token.symbol}
            variant="rounded"
            onError={() => setImgError(true)}
            sx={{ width: 40, height: 40, flexShrink: 0, border: 1, borderColor: 'divider', borderRadius: 1.25 }}
          />
        ) : (
          <Avatar
            variant="rounded"
            sx={{
              width: 40,
              height: 40,
              flexShrink: 0,
              bgcolor: 'action.hover',
              border: 1,
              borderColor: 'divider',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'text.secondary',
            }}
          >
            {token.symbol?.slice(0, 2) || '??'}
          </Avatar>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: '0.875rem',
              color: 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {token.name || 'Unknown'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, mt: 0.2, minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontWeight: 550,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              ${token.symbol}
            </Typography>
            {token.createdAt && (
              <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                · {formatAge(token.createdAt)} old
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      <Typography
        variant="body2"
        sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 650, color: 'text.primary', letterSpacing: '-0.015em' }}
      >
        {formatUsd(token.volume24h)}
      </Typography>

      <Typography
        variant="body2"
        sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 650, color: 'text.primary', letterSpacing: '-0.015em' }}
      >
        {formatUsd(token.observedPeakMarketCap)}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          display: { xs: 'none', sm: 'block' },
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 500,
          color: 'text.secondary',
          letterSpacing: '-0.015em',
        }}
      >
        {formatUsd(token.marketCap)}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          display: { xs: 'none', sm: 'block' },
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
          color: changeColor(change),
        }}
      >
        {formatPercent(change)}
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', color: 'text.disabled' }}>
        <ChevronRightIcon sx={{ fontSize: 18 }} />
      </Box>
    </Box>
  );
});
