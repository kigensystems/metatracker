import { AppBar, Box, IconButton, LinearProgress, Toolbar, Tooltip, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { DataFreshness } from '../lib/types';
import { colors, HEADER_HEIGHT } from '../lib/theme';
import { NextRuns } from './NextRuns';

interface HeaderProps {
  freshness: DataFreshness | null;
  onRefresh: () => void;
  loading: boolean;
}

export function Header({ freshness, onRefresh, loading }: HeaderProps) {
  const stale = freshness?.isStale ?? false;
  const historical = freshness?.source === 'historical';
  const statusColor = stale ? 'warning.main' : historical ? 'text.disabled' : 'primary.main';

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar
        disableGutters
        sx={{
          justifyContent: 'space-between',
          minHeight: HEADER_HEIGHT,
          width: '100%',
          maxWidth: 1120,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{ fontSize: '0.9rem', fontWeight: 600, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}
          >
            <span style={{ color: colors.text }}>meta</span>
            <span style={{ color: colors.accent }}>.tracker</span>
          </Typography>

          {freshness && (
            <Box
              aria-hidden="true"
              sx={{
                width: 6,
                height: 6,
                ml: 1,
                borderRadius: '50%',
                bgcolor: statusColor,
                flexShrink: 0,
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2.5 }, flexShrink: 0 }}>
          {/* Rendered once, here: a second copy toggled by CSS would keep its
              own one-second interval running behind the hidden one. */}
          <NextRuns sx={{ gap: { xs: 1.25, sm: 2.5 } }} />

          <Tooltip title="Refresh data" arrow>
            <span>
              <IconButton
                onClick={onRefresh}
                disabled={loading}
                size="small"
                aria-label="Refresh data"
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 0.5,
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <RefreshIcon
                  sx={{
                    fontSize: 16,
                    color: loading ? 'text.disabled' : 'text.secondary',
                    animation: loading ? 'spin 1s linear infinite' : 'none',
                    '@keyframes spin': {
                      from: { transform: 'rotate(0deg)' },
                      to: { transform: 'rotate(360deg)' },
                    },
                  }}
                />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Toolbar>

      {loading && (
        <LinearProgress
          sx={{
            height: 2,
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            '& .MuiLinearProgress-bar': { backgroundColor: 'primary.main' },
          }}
        />
      )}
    </AppBar>
  );
}
