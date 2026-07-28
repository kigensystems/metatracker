import { useMemo } from 'react';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { TokenRow, ROW_GRID } from './TokenRow';
import { colors, FIGURE, HEADER_HEIGHT, LABEL } from '../lib/theme';
import type { GraduatedToken, SortKey } from '../lib/types';

const HIDE_ON_XS = { xs: 'none', sm: 'flex' } as const;

interface TokenListProps {
  tokens: GraduatedToken[];
  totalCount: number;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onTokenSelect: (token: GraduatedToken) => void;
}

interface SortHeaderProps {
  label: string;
  /** Narrow columns need a shorter name so the header never wraps on mobile. */
  shortLabel?: string;
  column: SortKey;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  hideOnXs?: boolean;
}

function SortHeader({ label, shortLabel, column, activeKey, dir, onSort, hideOnXs }: SortHeaderProps) {
  const active = activeKey === column;
  return (
    <Box
      onClick={() => onSort(column)}
      role="button"
      tabIndex={0}
      aria-label={`Sort by ${label}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(column);
        }
      }}
      sx={{
        display: hideOnXs ? HIDE_ON_XS : 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 0.25,
        cursor: 'pointer',
        '&:hover .MuiTypography-root, &:hover .MuiSvgIcon-root': { color: 'text.primary' },
        '&:focus-visible': { outline: '1px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      {/* The caret sits left of the label so the label's right edge lands on
          the column's right edge, exactly where the figures below it align. */}
      {active ? (
        dir === 'desc' ? (
          <KeyboardArrowDownIcon sx={{ fontSize: 15, color: 'text.primary' }} />
        ) : (
          <KeyboardArrowUpIcon sx={{ fontSize: 15, color: 'text.primary' }} />
        )
      ) : (
        <KeyboardArrowDownIcon sx={{ fontSize: 15, color: 'text.disabled', opacity: 0 }} />
      )}
      <Typography
        sx={{
          ...LABEL,
          color: active ? 'text.primary' : 'text.secondary',
          transition: 'color 0.15s',
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {shortLabel ? (
          <>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{label}</Box>
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{shortLabel}</Box>
          </>
        ) : (
          label
        )}
      </Typography>
    </Box>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <IconButton
        size="small"
        aria-label="Previous page"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        sx={{ border: 1, borderColor: 'divider', borderRadius: 0.5 }}
      >
        <ChevronLeftIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Typography sx={{ ...FIGURE, fontSize: '0.75rem', color: 'text.secondary', minWidth: 76, textAlign: 'center' }}>
        {page} / {totalPages}
      </Typography>
      <IconButton
        size="small"
        aria-label="Next page"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        sx={{ border: 1, borderColor: 'divider', borderRadius: 0.5 }}
      >
        <ChevronRightIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Box>
  );
}

export function TokenList({
  tokens,
  totalCount,
  sortKey,
  sortDir,
  onSort,
  page,
  totalPages,
  onPageChange,
  onTokenSelect,
}: TokenListProps) {
  const startIndex = (page - 1) * 50 + 1;
  const endIndex = Math.min(page * 50, totalCount);

  // This meta relaunches the same ticker repeatedly. Six rows reading
  // "SOLANA NUT" look like a bug until the mint tells them apart.
  const repeatedSymbols = useMemo(() => {
    const seen = new Map<string, number>();
    for (const token of tokens) {
      const key = token.symbol?.toLowerCase() ?? '';
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return new Set([...seen].filter(([, count]) => count > 1).map(([key]) => key));
  }, [tokens]);

  return (
    <Box component="section">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, mb: 1.25 }}>
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          Launches, art, market cap and peak from pump.fun · volume and liquidity from DexScreener
        </Typography>
        {totalPages > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
            <Typography sx={{ ...FIGURE, fontSize: '0.7rem', color: 'text.disabled', display: HIDE_ON_XS }}>
              {startIndex}–{endIndex}
            </Typography>
            <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
          </Box>
        )}
      </Box>

      <Paper
        elevation={0}
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 0.5,
          // No `overflow: hidden` here: it would make this Paper the scroll
          // container and strand the sticky header on top of the first row.
        }}
      >
        {/* Table header. Sticks under the app bar so the columns stay named
            while a long cohort scrolls past. */}
        <Box
          sx={{
            ...ROW_GRID,
            position: 'sticky',
            top: HEADER_HEIGHT,
            zIndex: 2,
            px: { xs: 1.25, sm: 2 },
            py: 1.15,
            borderBottom: 1,
            borderColor: 'divider',
            // Opaque rather than blurred: rows must not show through, and this
            // repaints on every scroll frame.
            backgroundColor: colors.abyss,
          }}
        >
          <Typography sx={{ ...LABEL, color: 'text.secondary' }}>Token</Typography>
          <SortHeader
            label="Age"
            column="createdAt"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
            hideOnXs
          />
          <SortHeader
            label="24h vol"
            shortLabel="Vol"
            column="volume24h"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
          />

          <SortHeader
            label="Observed peak"
            shortLabel="Peak"
            column="observedPeakMarketCap"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
          />

          <SortHeader
            label="Market cap"
            shortLabel="MC"
            column="marketCap"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
            hideOnXs
          />
          <SortHeader
            label="24h"
            column="priceChange24h"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
            hideOnXs
          />
          {/* Spacer for the row chevron, which only exists from `sm` up. */}
          <Box sx={{ display: HIDE_ON_XS }} />
        </Box>

        {/* Table body */}
        <Box>
          {tokens.map((token) => (
            <TokenRow
              key={token.mint}
              token={token}
              ambiguous={repeatedSymbols.has(token.symbol?.toLowerCase() ?? '')}
              onSelect={onTokenSelect}
            />
          ))}
        </Box>
      </Paper>

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mt: 3 }}>
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </Box>
      )}
    </Box>
  );
}
