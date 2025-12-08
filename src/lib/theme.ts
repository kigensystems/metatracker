import { createTheme } from '@mui/material/styles';

// Match the existing design system
const colors = {
  void: '#0a0a0c',
  abyss: '#111114',
  slate: '#18181b',
  steel: '#27272a',
  muted: '#4a5568',
  ghost: '#a0aec0',
  neonGreen: '#39ff14',
  neonPurple: '#aa55ff',
  neonAmber: '#ffd700',
  neonRed: '#ff3366',
  neonBlue: '#00aaff',
};

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: colors.neonGreen,
      contrastText: colors.void,
    },
    secondary: {
      main: colors.neonPurple,
      contrastText: '#fff',
    },
    error: {
      main: colors.neonRed,
    },
    warning: {
      main: colors.neonAmber,
    },
    info: {
      main: colors.neonBlue,
    },
    background: {
      default: colors.void,
      paper: colors.abyss,
    },
    text: {
      primary: '#e8e8f0',
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
          transition: 'all 0.2s ease',
        },
        outlined: {
          borderColor: colors.steel,
          '&:hover': {
            backgroundColor: colors.slate,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'all 0.2s ease',
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
          backgroundColor: `${colors.abyss}cc`,
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${colors.steel}`,
        },
      },
    },
  },
});

export { colors };
