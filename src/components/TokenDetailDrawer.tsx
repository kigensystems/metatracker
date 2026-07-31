import { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
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
import type { GraduatedToken } from '../lib/types';
import { safeExternalUrl } from '../lib/external-url';
import { changeColor, formatAge, formatCompact, formatDateTime, formatPercent, formatUsd } from '../lib/format';
import { colors, FIGURE, LABEL } from '../lib/theme';
import { hasClearedPeak, REPORTED_PEAK_INTERVAL } from '../lib/peak';
import { tokenLinks } from '../lib/token-links';

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

    // pump.fun tracks a true all-time high from the token's creation, so those
    // rows can say so. Candle-derived readings stay "observed peak", which is
    // all a bounded window supports.
    const isReportedAth = token.observedPeakCandleInterval === REPORTED_PEAK_INTERVAL;
    const when = (value: number | null | undefined, label: string): StatItem[] =>
      value == null ? [] : [{ label, value: formatDateTime(value) }];
    const usd = (value: number | null | undefined, label: string): StatItem[] =>
      value == null ? [] : [{ label, value: formatUsd(value) }];

    return [
      { label: 'Dex 24h volume', value: formatUsd(token.volume24h) },
      {
        label: isReportedAth ? 'ATH market cap' : 'Observed peak MC',
        value: formatUsd(token.observedPeakMarketCap),
        // Same reading as the list: green means it cleared the $100k bar.
        color: hasClearedPeak(token) ? 'primary.main' : undefined,
      },
      ...usd(token.dexMarketCap, 'Dex market cap'),
      ...when(token.observedPeakAt, isReportedAth ? 'ATH reached' : 'Peak observed'),
      { label: 'Market cap', value: formatUsd(token.marketCap) },
      { label: 'Dex 24h change', value: formatPercent(token.priceChange24h), color: changeColor(token.priceChange24h) },
      { label: 'Dex liquidity', value: formatUsd(token.liquidity) },
      ...usd(token.dexPriceUsd, 'Dex price'),
      { label: 'Created', value: formatDateTime(token.createdAt) },
      // Only rows captured by the retired Dune pipeline carry these at all.
      ...usd(token.duneMarketCap, 'Dune market cap'),
      ...usd(token.duneVwapPrice, 'Dune VWAP price'),
      ...(token.tradeCount == null
        ? []
        : [{ label: 'Dune trade count', value: formatCompact(token.tradeCount) }]),
    ];
  }, [token]);

  const externalLinks = useMemo(() => {
    if (!token) return [];

    // The row's own set, so the drawer inherits its filter for "websites" that
    // are really just the launch venue — plus the explorers the row has no room
    // for.
    const explorers: Array<{ label: string; url: string | null }> = [
      { label: 'Birdeye', url: safeExternalUrl(token.links.birdeye) },
      { label: 'Solscan', url: safeExternalUrl(token.links.solscan) },
    ];

    return [
      ...tokenLinks(token),
      ...explorers.filter((link): link is ExternalLink => (
        typeof link.url === 'string' && link.url.length > 0
      )),
    ];
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
                    sx={{ color: 'text.secondary', fontFamily: FIGURE.fontFamily }}
                    variant="outlined"
                  />
                  {token.createdAt && (
                    <Chip
                      size="small"
                      label={formatAge(token.createdAt)}
                      sx={{ color: 'text.secondary', fontFamily: FIGURE.fontFamily }}
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
                  fontFamily: FIGURE.fontFamily,
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
                backgroundColor: colors.slate,
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
                    <Typography sx={{ ...LABEL, color: 'text.secondary', display: 'block', mb: 0.6 }}>
                      {stat.label}
                    </Typography>
                    <Typography
                      sx={{
                        ...FIGURE,
                        color,
                        fontSize: '0.85rem',
                        fontWeight: 500,
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
              {/* Only rows captured by the retired Dune pipeline carry an
                  execution time; pump.fun-sourced rows have no such stage. */}
              {token.sourceExecutionEndedAt && (
                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    Dune query · market cap, VWAP price, trades
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: FIGURE.fontFamily, mt: 0.5 }}>
                    {formatDateTime(Date.parse(token.sourceExecutionEndedAt))}
                  </Typography>
                </Box>
              )}
              {token.observedPeakSource && (
                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    {token.observedPeakCandleInterval === REPORTED_PEAK_INTERVAL
                      ? 'pump.fun · all-time high reported by the venue, covering'
                      : `Solana Tracker · highest ${token.observedPeakCandleInterval || ''} candle in`}
                    {' '}the window below
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: FIGURE.fontFamily, mt: 0.5 }}>
                    {token.observedPeakWindowFrom && token.observedPeakWindowTo
                      ? `${formatDateTime(token.observedPeakWindowFrom)} → ${formatDateTime(token.observedPeakWindowTo)}`
                      : 'Observation window not recorded'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: FIGURE.fontFamily, mt: 0.5, color: 'text.secondary' }}>
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
                <Typography variant="body2" sx={{ fontFamily: FIGURE.fontFamily, mt: 0.5 }}>
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
                      fontFamily: FIGURE.fontFamily,
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

            {/* Same treatment as RowActions: named text links, not boxed
                icon buttons — the owner rejected the chip/button style. */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 1 }}>
              {externalLinks.map((link) => (
                <Box
                  key={link.label}
                  component="a"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    color: 'primary.main',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    '&:hover': { textDecoration: 'underline' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                >
                  {link.label}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
