import { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Tooltip,
  Chip,
  Box,
  Typography,
  LinearProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SyncIcon from '@mui/icons-material/Sync';

interface HeaderProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
  loading: boolean;
}

export function Header({
  lastUpdated,
  onRefresh,
  loading,
}: HeaderProps) {
  const [timeUntilSync, setTimeUntilSync] = useState('');

  useEffect(() => {
    const calculateTimeUntilSync = () => {
      const slotMs = 2 * 60 * 60 * 1000;
      const now = Date.now();
      const nextSlot = Math.ceil(now / slotMs) * slotMs;
      const minutesUntil = Math.max(0, Math.round((nextSlot - now) / 60000));
      const hours = Math.floor(minutesUntil / 60);
      const minutes = minutesUntil % 60;

      if (minutesUntil <= 1) return 'Soon';
      if (hours === 0) return `${minutes}m`;
      return `${hours}h ${minutes}m`;
    };

    setTimeUntilSync(calculateTimeUntilSync());
    const interval = setInterval(() => {
      setTimeUntilSync(calculateTimeUntilSync());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const formatRelativeTime = (date: Date | null): string => {
    if (!date) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${diffHours}h ago`;
  };

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar sx={{ justifyContent: 'space-between', minHeight: { xs: 56, sm: 64 } }}>
        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <img
            src="/logo.png"
            alt="meta.tracker"
            style={{ width: 32, height: 32, imageRendering: 'pixelated' }}
          />
          <Typography
            component="h1"
            sx={{
              fontFamily: "'Inter', sans-serif",
              fontSize: { xs: '14px', sm: '16px' },
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            <span style={{ color: '#fafafa' }}>meta</span>
            <span style={{ color: '#22c55e' }}>.tracker</span>
          </Typography>
        </Box>

        {/* Right side - status indicators */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Last updated */}
          {lastUpdated && (
            <Tooltip title="Last updated" arrow>
              <Chip
                icon={<AccessTimeIcon sx={{ fontSize: 14 }} />}
                label={formatRelativeTime(lastUpdated)}
                size="small"
                variant="outlined"
                sx={{
                  display: { xs: 'none', sm: 'flex' },
                  borderColor: 'divider',
                  color: 'text.secondary',
                  '& .MuiChip-icon': { color: 'text.secondary' },
                }}
              />
            </Tooltip>
          )}

          {/* Next sync countdown */}
          <Tooltip title="Next scheduled sync (every 2h, UTC)" arrow>
            <Chip
              icon={<SyncIcon sx={{ fontSize: 14 }} />}
              label={timeUntilSync}
              size="small"
              variant="outlined"
              sx={{
                display: { xs: 'none', sm: 'flex' },
                borderColor: 'divider',
                color: 'text.secondary',
                '& .MuiChip-icon': { color: 'text.secondary' },
                '& .MuiChip-label': { fontFamily: 'monospace' },
              }}
            />
          </Tooltip>

          {/* Refresh button */}
          <Tooltip title="Refresh" arrow>
            <span>
              <IconButton
                onClick={onRefresh}
                disabled={loading}
                size="small"
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  '&:hover': {
                    borderColor: 'text.secondary',
                  },
                }}
              >
                <RefreshIcon
                  sx={{
                    fontSize: 18,
                    color: 'text.secondary',
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

      {/* Loading bar */}
      {loading && (
        <LinearProgress
          sx={{
            height: 2,
            '& .MuiLinearProgress-bar': {
              backgroundColor: 'primary.main',
            },
          }}
        />
      )}
    </AppBar>
  );
}
