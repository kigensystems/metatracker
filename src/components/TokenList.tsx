import { Box, Paper, Typography, IconButton } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { TokenRow } from './TokenRow';
import type { GraduatedToken } from '../lib/types';

interface TokenListProps {
  tokens: GraduatedToken[];
  totalCount: number;
  sortOrder: 'asc' | 'desc';
  onSortChange: (order: 'asc' | 'desc') => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onTokenSelect: (token: GraduatedToken) => void;
}

export function TokenList({
  tokens,
  totalCount,
  sortOrder,
  onSortChange,
  page,
  totalPages,
  onPageChange,
  onTokenSelect,
}: TokenListProps) {
  const toggleSort = () => {
    onSortChange(sortOrder === 'desc' ? 'asc' : 'desc');
  };

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

        {totalPages > 1 && (
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
        )}
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
            display: 'grid',
            gridTemplateColumns: '48px 48px 1fr 110px 112px',
            gap: 2,
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
          <Box />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Token
          </Typography>
          <Box
            onClick={toggleSort}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 0.25,
              cursor: 'pointer',
              '&:hover .MuiTypography-root, &:hover .MuiSvgIcon-root': { color: 'text.primary' },
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, transition: 'color 0.15s' }}>
              Market Cap
            </Typography>
            <IconButton size="small" sx={{ p: 0 }}>
              {sortOrder === 'desc' ? (
                <KeyboardArrowDownIcon sx={{ fontSize: 16, color: 'text.secondary', transition: 'color 0.15s' }} />
              ) : (
                <KeyboardArrowUpIcon sx={{ fontSize: 16, color: 'text.secondary', transition: 'color 0.15s' }} />
              )}
            </IconButton>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textAlign: 'right' }}>
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
      )}
    </Box>
  );
}
