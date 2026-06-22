import { memo, useState } from 'react';
import { Box, Typography, IconButton, Avatar } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import type { GraduatedToken } from '../lib/types';
import { changeColor, formatAge, formatPercent, formatUsd } from '../lib/format';
import { XIcon } from './icons';

// Shared column template so the header and every row stay aligned.
// Columns: rank · token · 24h volume · market cap · 24h % · links
// On xs the last two (24h % and links) are hidden, leaving four tracks.
export const ROW_GRID = {
  display: 'grid',
  gridTemplateColumns: {
    xs: '32px minmax(0, 1fr) 84px 84px',
    sm: '40px minmax(0, 1fr) 110px 110px 92px 100px',
  },
  columnGap: { xs: 1, sm: 2 },
  alignItems: 'center',
} as const;

interface TokenRowProps {
  token: GraduatedToken;
  index: number;
  onSelect: (token: GraduatedToken) => void;
}

export const TokenRow = memo(function TokenRow({ token, index, onSelect }: TokenRowProps) {
  const [imgError, setImgError] = useState(false);

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, '_blank');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(token);
    }
  };

  const change = token.priceChange24h;
  const hasSocials = token.website || token.twitter;

  return (
    <Box
      component="div"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(token)}
      onKeyDown={handleKeyDown}
      sx={{
        ...ROW_GRID,
        px: 2.5,
        py: 1.5,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
        borderBottom: 1,
        borderColor: 'divider',
        transition: 'background-color 0.15s',
        '&:hover': { backgroundColor: 'action.hover' },
        '&:last-child': { borderBottom: 0 },
      }}
    >
      {/* Row number */}
      <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontWeight: 500 }}>
        {index + 1}
      </Typography>

      {/* Token: avatar + name/symbol/age */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        {token.image && !imgError ? (
          <Avatar
            src={token.image}
            alt={token.symbol}
            variant="rounded"
            onError={() => setImgError(true)}
            sx={{ width: 36, height: 36, flexShrink: 0, border: 1, borderColor: 'divider' }}
          />
        ) : (
          <Avatar
            variant="rounded"
            sx={{
              width: 36,
              height: 36,
              flexShrink: 0,
              bgcolor: 'action.hover',
              border: 1,
              borderColor: 'divider',
              fontSize: '0.7rem',
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
              fontWeight: 500,
              color: 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {token.name || 'Unknown'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.125, minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{
                color: 'warning.main',
                fontFamily: 'monospace',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              ${token.symbol}
            </Typography>
            {token.createdAt && (
              <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                · {formatAge(token.createdAt)}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      {/* 24h volume — the headline metric */}
      <Typography
        variant="body2"
        sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'text.primary' }}
      >
        {formatUsd(token.volume24h)}
      </Typography>

      {/* Market cap */}
      <Typography
        variant="body2"
        sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 500, color: 'text.primary' }}
      >
        {formatUsd(token.marketCap)}
      </Typography>

      {/* 24h change */}
      <Typography
        variant="body2"
        sx={{
          display: { xs: 'none', sm: 'block' },
          textAlign: 'right',
          fontFamily: 'monospace',
          fontWeight: 600,
          color: changeColor(change),
        }}
      >
        {formatPercent(change)}
      </Typography>

      {/* Socials */}
      <Box sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'flex-end', gap: 0.5 }}>
        {hasSocials ? (
          <>
            {token.website && (
              <IconButton
                size="small"
                onClick={(e) => handleLinkClick(e, token.website!)}
                aria-label="Website"
                sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary', backgroundColor: 'action.hover' } }}
              >
                <LanguageIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}
            {token.twitter && (
              <IconButton
                size="small"
                onClick={(e) => handleLinkClick(e, token.twitter!)}
                aria-label="X"
                sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary', backgroundColor: 'action.hover' } }}
              >
                <XIcon size={16} />
              </IconButton>
            )}
          </>
        ) : (
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            —
          </Typography>
        )}
      </Box>
    </Box>
  );
});
