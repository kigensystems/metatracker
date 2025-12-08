import { createTheme } from '@mui/material/styles';

// Clean, professional color palette
const colors = {
  void: '#09090b',
  abyss: '#0f0f12',
  slate: '#18181b',
  steel: '#27272a',
  muted: '#52525b',
  ghost: '#a1a1aa',
  // Softer, more professional accent colors
  accent: '#22c55e',      // Muted green (was neon #39ff14)
  accentMuted: '#16a34a',
  purple: '#a78bfa',      // Softer purple
  amber: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
};

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: colors.accent,
      contrastText: colors.void,
    },
    secondary: {
      main: colors.purple,
      contrastText: '#fff',
    },
    error: {
      main: colors.red,
    },
    warning: {
      main: colors.amber,
    },
    info: {
      main: colors.blue,
    },
    background: {
      default: colors.void,
      paper: colors.abyss,
    },
    text: {
      primary: '#fafafa',
      secondary: colors.ghost,
    },
    divider: colors.steel,
  },
  typography: {
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          transition: 'all 0.15s ease',
        },
        outlined: {
          borderColor: colors.steel,
          '&:hover': {
            backgroundColor: colors.slate,
            borderColor: colors.muted,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'all 0.15s ease',
          '&:hover': {
            backgroundColor: colors.slate,
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: colors.slate,
          border: `1px solid ${colors.steel}`,
          fontSize: '0.75rem',
        },
        arrow: {
          color: colors.slate,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: colors.abyss,
          borderBottom: `1px solid ${colors.steel}`,
        },
      },
    },
  },
});

export { colors };
