import { createTheme } from '@mui/material/styles';

const colors = {
  void: '#0b0c0e',
  abyss: '#111315',
  slate: '#171a1d',
  steel: '#272b30',
  muted: '#6f767f',
  ghost: '#9ba2ab',
  accent: '#72d38c',
  accentMuted: '#4eaa68',
  purple: '#a9a0dc',
  amber: '#d6a85f',
  red: '#e06c75',
  blue: '#72a7d8',
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
      primary: '#f1f3f4',
      secondary: colors.ghost,
    },
    divider: colors.steel,
  },
  typography: {
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h4: {
      fontWeight: 650,
      letterSpacing: '-0.035em',
    },
    h6: {
      fontWeight: 650,
      letterSpacing: '-0.02em',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: 'none',
        },
        '::selection': {
          backgroundColor: 'rgba(114, 211, 140, 0.24)',
        },
      },
    },
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
          backgroundColor: 'rgba(11, 12, 14, 0.88)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid rgba(255, 255, 255, 0.07)`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

export { colors };
