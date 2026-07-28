import {
  AppBar,
  Toolbar,
  IconButton,
  Tooltip,
  Box,
  Typography,
  LinearProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

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
      <Toolbar
        disableGutters
        sx={{
          justifyContent: 'space-between',
          minHeight: { xs: 58, sm: 66 },
          width: '100%',
          maxWidth: 1200,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <img
            src="/logo.png"
            alt="meta.tracker"
            style={{ width: 30, height: 30, imageRendering: 'pixelated' }}
          />
          <Typography
            component="h1"
            sx={{
              fontSize: '0.95rem',
              fontWeight: 650,
              letterSpacing: '-0.025em',
            }}
          >
            <span style={{ color: '#f1f3f4' }}>meta</span>
            <span style={{ color: '#72d38c' }}>.tracker</span>
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1.5 } }}>
          {lastUpdated && (
            <Typography
              variant="caption"
              sx={{
                display: { xs: 'none', sm: 'flex' },
                color: 'text.secondary',
              }}
            >
              Updated {formatRelativeTime(lastUpdated)}
            </Typography>
          )}

          <Tooltip title="Refresh data" arrow>
            <span>
              <IconButton
                onClick={onRefresh}
                disabled={loading}
                size="small"
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                <RefreshIcon
                  sx={{
                    fontSize: 18,
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
            '& .MuiLinearProgress-bar': {
              backgroundColor: 'primary.main',
            },
          }}
        />
      )}
    </AppBar>
  );
}
