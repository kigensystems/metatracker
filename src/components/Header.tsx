import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
  tokenCount: number;
  lastUpdated: Date | null;
  onRefresh: () => void;
  loading: boolean;
  selectedDate: string | null;
}

export function Header({
  tokenCount,
  lastUpdated,
  onRefresh,
  loading,
  selectedDate,
}: HeaderProps) {
  const [timeUntilSync, setTimeUntilSync] = useState('');

  useEffect(() => {
    const calculateTimeUntilSync = () => {
      const now = new Date();
      const utcHours = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();

      let hoursUntil: number;
      if (utcHours < 12) {
        hoursUntil = 11 - utcHours + (utcMinutes > 0 ? 0 : 1);
      } else {
        hoursUntil = 23 - utcHours + (utcMinutes > 0 ? 0 : 1);
      }
      const minutesUntil = utcMinutes > 0 ? 60 - utcMinutes : 0;

      if (hoursUntil === 0 && minutesUntil <= 1) {
        return 'Syncing soon';
      } else if (hoursUntil === 0) {
        return `${minutesUntil}m`;
      } else {
        return `${hoursUntil}h ${minutesUntil}m`;
      }
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

  const formatDisplayDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Today';
    const date = new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  const isLive = !selectedDate;

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar sx={{ justifyContent: 'space-between', minHeight: { xs: 56, sm: 64 } }}>
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <img
              src="/logo.png"
              alt="meta.tracker"
              style={{ width: 36, height: 36, imageRendering: 'pixelated' }}
            />
            <Typography
              component="h1"
              sx={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: { xs: '10px', sm: '12px' },
                letterSpacing: '0.05em',
              }}
            >
              <span style={{ color: '#fff' }}>META</span>
              <span
                style={{
                  color: '#39ff14',
                  textShadow: '0 0 10px rgba(57, 255, 20, 0.5)',
                }}
              >
                .TRACKER
              </span>
            </Typography>
          </Box>
        </motion.div>

        {/* Right side */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
            {/* Date + Token count chip */}
            <Chip
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>{formatDisplayDate(selectedDate)}</span>
                  <Box
                    component="span"
                    sx={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      backgroundColor: 'text.secondary',
                    }}
                  />
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {tokenCount}
                  </span>
                </Box>
              }
              variant="outlined"
              sx={{
                borderColor: isLive ? 'primary.main' : 'secondary.main',
                color: isLive ? 'primary.main' : 'secondary.main',
                '& .MuiChip-label': { px: 1.5 },
              }}
            />

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
            <Tooltip title="Next scheduled sync (00:00 or 12:00 UTC)" arrow>
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
            <Tooltip title="Refresh data" arrow>
              <span>
                <IconButton
                  onClick={onRefresh}
                  disabled={loading}
                  size="small"
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    '&:hover': {
                      borderColor: 'primary.main',
                      '& .MuiSvgIcon-root': { color: 'primary.main' },
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
        </motion.div>
      </Toolbar>

      {/* Loading bar */}
      {loading && (
        <LinearProgress
          sx={{
            height: 2,
            '& .MuiLinearProgress-bar': {
              background: 'linear-gradient(90deg, #39ff14, #00aaff, #aa55ff)',
            },
          }}
        />
      )}
    </AppBar>
  );
}
