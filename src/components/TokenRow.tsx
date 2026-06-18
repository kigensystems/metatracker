import { useState } from 'react';
import { Box, Typography, IconButton, Avatar } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import type { GraduatedToken } from '../lib/types';

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

interface TokenRowProps {
  token: GraduatedToken;
  index: number;
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

function formatCreatedAt(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function TokenRow({ token, index }: TokenRowProps) {
  const [imgError, setImgError] = useState(false);
  const dexUrl = token.dexScreenerUrl || token.links.dexscreener || '#';

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, '_blank');
  };

  const hasSocials = token.website || token.twitter;

  return (
    <Box
      component="a"
      href={dexUrl}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        display: 'grid',
        gridTemplateColumns: '48px 48px 1fr 110px 90px',
        gap: 2,
        px: 2.5,
        py: 2,
        alignItems: 'center',
        textDecoration: 'none',
        color: 'inherit',
        borderBottom: 1,
        borderColor: 'divider',
        transition: 'background-color 0.15s',
        '&:hover': {
          backgroundColor: 'action.hover',
        },
        '&:last-child': {
          borderBottom: 0,
        },
      }}
    >
      {/* Row Number */}
      <Typography
        variant="body2"
        sx={{ color: 'text.secondary', fontFamily: 'monospace', fontWeight: 500 }}
      >
        {index + 1}
      </Typography>

      {/* Token Image */}
      {token.image && !imgError ? (
        <Avatar
          src={token.image}
          alt={token.symbol}
          variant="rounded"
          onError={() => setImgError(true)}
          sx={{ width: 40, height: 40, border: 1, borderColor: 'divider' }}
        />
      ) : (
        <Avatar
          variant="rounded"
          sx={{
            width: 40,
            height: 40,
            bgcolor: 'action.hover',
            border: 1,
            borderColor: 'divider',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'text.secondary',
          }}
        >
          {token.symbol?.slice(0, 2) || '??'}
        </Avatar>
      )}

      {/* Token Name/Symbol */}
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
          <Typography
            variant="caption"
            sx={{ color: 'warning.main', fontFamily: 'monospace', fontWeight: 500 }}
          >
            ${token.symbol}
          </Typography>
          {token.createdAt && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {formatCreatedAt(token.createdAt)}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Market Cap */}
      <Typography
        variant="body2"
        sx={{
          textAlign: 'right',
          fontFamily: 'monospace',
          fontWeight: 600,
          color: 'primary.main',
        }}
      >
        {formatNumber(token.marketCap)}
      </Typography>

      {/* Socials */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
        {hasSocials ? (
          <>
            {token.website && (
              <IconButton
                size="small"
                onClick={(e) => handleLinkClick(e, token.website!)}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'text.primary', backgroundColor: 'action.hover' },
                }}
              >
                <LanguageIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}
            {token.twitter && (
              <IconButton
                size="small"
                onClick={(e) => handleLinkClick(e, token.twitter!)}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'text.primary', backgroundColor: 'action.hover' },
                }}
              >
                <XIcon />
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
}
