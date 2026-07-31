import { memo, useState } from 'react';
import { Box, Typography, Avatar } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { GraduatedToken } from '../lib/types';
import { FIGURE, inkAlpha } from '../lib/theme';
import { changeColor, formatAge, formatPercent, formatUsd } from '../lib/format';
import { PeakCell } from './PeakCell';
import { RowActions } from './RowActions';

// Shared column template so the header and every row stay aligned.
// Mobile: token · 24h volume · observed peak · links · detail affordance.
// Desktop adds age, market cap, and 24h change. The age column exists to
// carry information through the space the name column used to leave empty.
// Mobile drops the chevron: the whole row is already the tap target, and those
// pixels are worth more to the token name.
export const ROW_GRID = {
  display: 'grid',
  gridTemplateColumns: {
    xs: 'minmax(0, 1fr) 70px 78px',
    sm: 'minmax(0, 1fr) 52px 108px 112px 96px 84px 18px',
  },
  columnGap: { xs: 0.75, sm: 1.75 },
  alignItems: 'center',
} as const;

const HIDE_ON_XS = { xs: 'none', sm: 'block' } as const;

interface TokenRowProps {
  token: GraduatedToken;
  /** True when another token in this snapshot shares the symbol. */
  ambiguous?: boolean;
  onSelect: (token: GraduatedToken) => void;
}

export const TokenRow = memo(function TokenRow({ token, ambiguous, onSelect }: TokenRowProps) {
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
        py: 1.4,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
        borderBottom: 1,
        borderColor: 'divider',
        transition: 'background-color 0.15s',
        '&:hover': { backgroundColor: inkAlpha(0.028) },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        '&:last-child': { borderBottom: 0 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        {token.image && !imgError ? (
          <Avatar
            src={token.image}
            alt=""
            variant="rounded"
            onError={() => setImgError(true)}
            sx={{ width: { xs: 46, sm: 56 }, height: { xs: 46, sm: 56 }, flexShrink: 0, border: 1, borderColor: 'divider', borderRadius: 0.5 }}
          />
        ) : (
          <Avatar
            variant="rounded"
            sx={{
              width: { xs: 46, sm: 56 },
              height: { xs: 46, sm: 56 },
              flexShrink: 0,
              bgcolor: 'action.hover',
              border: 1,
              borderColor: 'divider',
              borderRadius: 0.5,
              fontFamily: FIGURE.fontFamily,
              fontSize: '0.7rem',
              fontWeight: 500,
              color: 'text.secondary',
            }}
          >
            {token.symbol?.slice(0, 2).toUpperCase() || '??'}
          </Avatar>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              fontSize: '0.875rem',
              color: 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {token.name || 'Unknown'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.15, minWidth: 0 }}>
            <Typography
              sx={{
                ...FIGURE,
                fontSize: '0.7rem',
                color: 'text.secondary',
                flexShrink: 0,
              }}
            >
              ${token.symbol}
            </Typography>
            {ambiguous && (
              <Typography
                title={token.mint}
                sx={{
                  ...FIGURE,
                  fontSize: '0.65rem',
                  color: 'text.disabled',
                  border: 1,
                  borderColor: 'divider',
                  px: 0.5,
                  flexShrink: 0,
                }}
              >
                {token.mint.slice(0, 4)}
              </Typography>
            )}
            {token.createdAt && (
              <Typography
                sx={{
                  ...FIGURE,
                  display: { xs: 'block', sm: 'none' },
                  fontSize: '0.7rem',
                  color: 'text.disabled',
                  flexShrink: 0,
                }}
              >
                {formatAge(token.createdAt)}
              </Typography>
            )}
          </Box>
          <RowActions token={token} />
        </Box>
      </Box>

      <Typography
        sx={{
          ...FIGURE,
          display: HIDE_ON_XS,
          fontSize: '0.75rem',
          textAlign: 'right',
          color: 'text.disabled',
        }}
      >
        {formatAge(token.createdAt)}
      </Typography>

      <Typography
        sx={{ ...FIGURE, fontSize: '0.8125rem', textAlign: 'right', fontWeight: 500, color: 'text.primary' }}
      >
        {formatUsd(token.volume24h)}
      </Typography>

      <PeakCell token={token} />

      <Typography
        sx={{
          ...FIGURE,
          display: HIDE_ON_XS,
          fontSize: '0.8125rem',
          textAlign: 'right',
          color: 'text.secondary',
        }}
      >
        {formatUsd(token.marketCap)}
      </Typography>

      <Typography
        sx={{
          ...FIGURE,
          display: HIDE_ON_XS,
          fontSize: '0.8125rem',
          textAlign: 'right',
          fontWeight: 500,
          color: changeColor(change),
        }}
      >
        {formatPercent(change)}
      </Typography>

      <Box
        sx={{
          display: { xs: 'none', sm: 'flex' },
          justifyContent: 'flex-end',
          color: 'text.disabled',
        }}
      >
        <ChevronRightIcon sx={{ fontSize: 16 }} />
      </Box>
    </Box>
  );
});
