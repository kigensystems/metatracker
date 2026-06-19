import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LanguageIcon from '@mui/icons-material/Language';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TelegramIcon from '@mui/icons-material/Telegram';
import type { GraduatedToken } from '../lib/types';

interface TokenDetailDrawerProps {
  token: GraduatedToken | null;
  open: boolean;
  onClose: () => void;
}

interface StatItem {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

interface ExternalLink {
  label: string;
  url: string;
  icon: ReactNode;
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(value >= 1 ? 2 : 6)}`;
}

function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    notation: value >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100_000 ? 1 : 0,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatAge(timestamp: number | null | undefined): string {
  if (!timestamp) return '-';
  const diffMs = Date.now() - timestamp;
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

function shortMint(mint: string): string {
  if (mint.length <= 12) return mint;
  return `${mint.slice(0, 6)}...${mint.slice(-6)}`;
}

export function TokenDetailDrawer({ token, open, onClose }: TokenDetailDrawerProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [copied, setCopied] = useState(false);

  const stats = useMemo<StatItem[]>(() => {
    if (!token) return [];

    return [
      { label: 'Market Cap', value: formatCurrency(token.marketCap) },
      { label: 'Liquidity', value: formatCurrency(token.liquidity) },
      { label: '24h Volume', value: formatCurrency(token.volume24h) },
      {
        label: '24h Change',
        value: formatPercent(token.priceChange24h),
        tone: token.priceChange24h === null || token.priceChange24h === undefined
          ? 'neutral'
          : token.priceChange24h >= 0
            ? 'positive'
            : 'negative',
      },
      { label: 'VWAP Price', value: formatCurrency(token.priceUsd) },
      { label: 'Trades', value: formatCompactNumber(token.tradeCount) },
      { label: 'Age', value: formatAge(token.createdAt) },
      { label: 'Created', value: formatDateTime(token.createdAt) },
    ];
  }, [token]);

  const externalLinks = useMemo(() => {
    if (!token) return [];

    const links: Array<{ label: string; url: string | null; icon: ReactNode }> = [
      { label: 'DexScreener', url: token.dexScreenerUrl || token.links.dexscreener, icon: <OpenInNewIcon /> },
      { label: 'Birdeye', url: token.links.birdeye, icon: <OpenInNewIcon /> },
      { label: 'Solscan', url: token.links.solscan, icon: <OpenInNewIcon /> },
      { label: 'Website', url: token.website, icon: <LanguageIcon /> },
      { label: 'X', url: token.twitter, icon: <XIcon /> },
      { label: 'Telegram', url: token.telegram, icon: <TelegramIcon /> },
    ];

    return links.filter((link): link is ExternalLink => (
      typeof link.url === 'string' && link.url.length > 0
    ));
  }, [token]);

  const copyMint = async () => {
    if (!token) return;

    try {
      await navigator.clipboard.writeText(token.mint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: fullScreen ? '100%' : 460,
          maxWidth: '100%',
          backgroundImage: 'none',
          borderLeft: fullScreen ? 0 : 1,
          borderColor: 'divider',
        },
      }}
    >
      {token && (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              px: 2.5,
              py: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Token Details
            </Typography>
            <Tooltip title="Close" arrow>
              <IconButton onClick={onClose} size="small" sx={{ borderRadius: 1 }}>
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ p: 2.5, overflowY: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
              <Avatar
                src={token.image || undefined}
                alt={token.symbol}
                variant="rounded"
                sx={{ width: 64, height: 64, border: 1, borderColor: 'divider' }}
              >
                {token.symbol?.slice(0, 2) || '??'}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {token.name || 'Unknown'}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    label={`$${token.symbol || '???'}`}
                    sx={{ color: 'warning.main', fontFamily: 'monospace' }}
                    variant="outlined"
                  />
                  {token.createdAt && (
                    <Chip
                      size="small"
                      label={formatAge(token.createdAt)}
                      sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                p: 1,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                mb: 2.5,
                minWidth: 0,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={token.mint}
              >
                {shortMint(token.mint)}
              </Typography>
              <Tooltip title={copied ? 'Copied' : 'Copy mint'} arrow>
                <IconButton onClick={copyMint} size="small" sx={{ borderRadius: 1 }}>
                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                overflow: 'hidden',
                mb: 2.5,
              }}
            >
              {stats.map((stat, index) => {
                const isRightColumn = index % 2 === 1;
                const isLastRow = index >= stats.length - 2;
                const color = stat.tone === 'positive'
                  ? 'primary.main'
                  : stat.tone === 'negative'
                    ? 'error.main'
                    : 'text.primary';

                return (
                  <Box
                    key={stat.label}
                    sx={{
                      p: 1.5,
                      minWidth: 0,
                      borderRight: isRightColumn ? 0 : 1,
                      borderBottom: isLastRow ? 0 : 1,
                      borderColor: 'divider',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
                    >
                      {stat.label}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color,
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {stat.value}
                    </Typography>
                  </Box>
                );
              })}
            </Box>

            <Divider sx={{ mb: 2 }} />

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              {externalLinks.map((link) => (
                <Button
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  size="small"
                  startIcon={link.icon}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    minWidth: 0,
                    '& .MuiButton-startIcon': { color: 'inherit' },
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {link.label}
                  </Box>
                </Button>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
