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
import type { GraduatedToken } from '../lib/types';
import { safeExternalUrl } from '../lib/external-url';
import { changeColor, formatAge, formatCompact, formatDateTime, formatPercent, formatUsd } from '../lib/format';
import { XIcon } from './icons';

interface TokenDetailDrawerProps {
  token: GraduatedToken | null;
  open: boolean;
  onClose: () => void;
}

interface StatItem {
  label: string;
  value: string;
  color?: string;
}

interface ExternalLink {
  label: string;
  url: string;
  icon: ReactNode;
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

    const items: StatItem[] = [
      { label: 'Dex 24h volume', value: formatUsd(token.volume24h) },
      { label: 'Observed peak MC', value: formatUsd(token.observedPeakMarketCap) },
      { label: 'Dune market cap', value: formatUsd(token.duneMarketCap ?? token.marketCap) },
      { label: 'Dex 24h change', value: formatPercent(token.priceChange24h), color: changeColor(token.priceChange24h) },
      { label: 'Dex liquidity', value: formatUsd(token.liquidity) },
      { label: 'Dune VWAP price', value: formatUsd(token.duneVwapPrice ?? token.priceUsd) },
      { label: 'Dune trade count', value: formatCompact(token.tradeCount) },
      { label: 'Pair created', value: formatDateTime(token.createdAt) },
    ];

    if (token.observedPeakAt != null) {
      items.splice(2, 0, { label: 'Peak observed', value: formatDateTime(token.observedPeakAt) });
    }

    if (token.dexMarketCap != null) {
      items.splice(2, 0, { label: 'Dex market cap', value: formatUsd(token.dexMarketCap) });
    }
    if (token.dexPriceUsd != null) {
      items.splice(-2, 0, { label: 'Dex price', value: formatUsd(token.dexPriceUsd) });
    }

    return items;
  }, [token]);

  const externalLinks = useMemo(() => {
    if (!token) return [];

    const links: Array<{ label: string; url: string | null; icon: ReactNode }> = [
      { label: 'DexScreener', url: safeExternalUrl(token.dexScreenerUrl || token.links.dexscreener), icon: <OpenInNewIcon /> },
      { label: 'Birdeye', url: safeExternalUrl(token.links.birdeye), icon: <OpenInNewIcon /> },
      { label: 'Solscan', url: safeExternalUrl(token.links.solscan), icon: <OpenInNewIcon /> },
      { label: 'Website', url: safeExternalUrl(token.website), icon: <LanguageIcon /> },
      { label: 'X', url: safeExternalUrl(token.twitter), icon: <XIcon /> },
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
              Token details
            </Typography>
            <Tooltip title="Close" arrow>
              <IconButton onClick={onClose} size="small" sx={{ borderRadius: 1 }}>
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ p: 2.5, overflowY: 'auto' }}>
            {token.bannerImage && (
              <Box
                component="img"
                key={token.bannerImage}
                src={token.bannerImage}
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                sx={{
                  display: 'block',
                  width: 'calc(100% + 40px)',
                  mx: -2.5,
                  mt: -2.5,
                  mb: 2.5,
                  height: 116,
                  objectFit: 'cover',
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              />
            )}

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
                borderRadius: 1.5,
                backgroundColor: 'rgba(255, 255, 255, 0.018)',
                gap: { xs: 2, sm: 2.5 },
                p: 2,
                mb: 2.5,
              }}
            >
              {stats.map((stat) => {
                const color = stat.color ?? 'text.primary';

                return (
                  <Box
                    key={stat.label}
                    sx={{
                      minWidth: 0,
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
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 650,
                        letterSpacing: '-0.015em',
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

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Source timing
            </Typography>
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                mb: 2.5,
                overflow: 'hidden',
              }}
            >
              <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Dune query · market cap, VWAP price, trades
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                  {token.sourceExecutionEndedAt
                    ? formatDateTime(Date.parse(token.sourceExecutionEndedAt))
                    : 'Execution time unavailable'}
                </Typography>
              </Box>
              {token.observedPeakSource && (
                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    Solana Tracker · highest
                    {token.observedPeakCandleInterval ? ` ${token.observedPeakCandleInterval}` : ''} candle
                    {' '}in the window below
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                    {token.observedPeakWindowFrom && token.observedPeakWindowTo
                      ? `${formatDateTime(token.observedPeakWindowFrom)} → ${formatDateTime(token.observedPeakWindowTo)}`
                      : 'Observation window not recorded'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5, color: 'text.secondary' }}>
                    {token.observedPeakFetchedAt
                      ? `Checked ${formatDateTime(token.observedPeakFetchedAt)}`
                      : 'History capture time unavailable'}
                  </Typography>
                </Box>
              )}
              <Box sx={{ p: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  DexScreener pair · current metrics and profile at capture
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                  {token.dexFetchedAt
                    ? formatDateTime(token.dexFetchedAt)
                    : 'Capture time was not recorded for this older snapshot'}
                </Typography>
                {token.dexPairAddress && (
                  <Typography
                    variant="caption"
                    title={token.dexPairAddress}
                    sx={{
                      color: 'text.secondary',
                      display: 'block',
                      fontFamily: 'monospace',
                      mt: 0.75,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Pair {token.dexPairAddress}
                  </Typography>
                )}
              </Box>
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
