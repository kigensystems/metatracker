import { Box, Paper, Typography, IconButton } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { TokenRow, ROW_GRID } from './TokenRow';
import type { GraduatedToken, SortKey } from '../lib/types';

// Columns hidden on xs (24h % and links) share this responsive display value.
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
  column: SortKey;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  hideOnXs?: boolean;
}

function SortHeader({ label, column, activeKey, dir, onSort, hideOnXs }: SortHeaderProps) {
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
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: active ? 'text.primary' : 'text.secondary',
          fontWeight: 600,
          transition: 'color 0.15s',
        }}
      >
        {label}
      </Typography>
      {active ? (
        dir === 'desc' ? (
          <KeyboardArrowDownIcon sx={{ fontSize: 16, color: 'text.primary' }} />
        ) : (
          <KeyboardArrowUpIcon sx={{ fontSize: 16, color: 'text.primary' }} />
        )
      ) : (
        <KeyboardArrowDownIcon sx={{ fontSize: 16, color: 'text.disabled', opacity: 0 }} />
      )}
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
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}
      >
        <ChevronLeftIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 80, textAlign: 'center' }}>
        Page {page} of {totalPages}
      </Typography>
      <IconButton
        size="small"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}
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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Showing{' '}
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 600, fontFamily: 'monospace' }}>
            {startIndex}–{endIndex}
          </Box>{' '}
          of{' '}
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 600, fontFamily: 'monospace' }}>
            {totalCount}
          </Box>{' '}
          tokens
        </Typography>

        {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />}
      </Box>

      <Paper
        elevation={0}
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        {/* Table header */}
        <Box
          sx={{
            ...ROW_GRID,
            px: 2.5,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            backgroundColor: 'action.hover',
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            #
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Token
          </Typography>
          <SortHeader label="24h Vol" column="volume24h" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortHeader label="Mkt Cap" column="marketCap" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortHeader
            label="24h %"
            column="priceChange24h"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
            hideOnXs
          />
          <Typography variant="caption" sx={{ display: HIDE_ON_XS, color: 'text.secondary', fontWeight: 600, justifyContent: 'flex-end' }}>
            Links
          </Typography>
        </Box>

        {/* Table body */}
        <Box>
          {tokens.map((token, index) => (
            <TokenRow
              key={token.mint}
              token={token}
              index={startIndex + index - 1}
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
