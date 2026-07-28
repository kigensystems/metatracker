import { createTheme } from '@mui/material/styles';

const colors = {
  void: '#fafaf8',
  abyss: '#ffffff',
  slate: '#f2f2ef',
  steel: '#e2e2de',
  muted: '#6b6f76',
  ghost: '#4e535a',
  text: '#16181c',
  accent: '#0f7b4f',
  accentMuted: '#0b5c3b',
  purple: '#5b4bb8',
  amber: '#9a5b00',
  red: '#c2314a',
  blue: '#1e6091',
};

/** Translucent accent fills, so the hue lives in exactly one place. */
export function accentAlpha(alpha: number): string {
  return `rgba(15, 123, 79, ${alpha})`;
}

/** Ink washes for hover and selected states on a paper ground. */
export function inkAlpha(alpha: number): string {
  return `rgba(22, 24, 28, ${alpha})`;
}

/**
 * App bar height. The table's sticky column header parks directly beneath it,
 * so both must agree — keep this the single source rather than two literals.
 */
export const HEADER_HEIGHT = { xs: 57, sm: 65 } as const;

/** Every figure and every label is set in mono; names and prose are not. */
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/** Small uppercase mono label used for column heads, eyebrows, and stat keys. */
export const LABEL = {
  fontFamily: MONO,
  fontSize: '0.6875rem',
  fontWeight: 500,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
} as const;

/** Tabular mono for anything the eye compares down a column. */
export const FIGURE = {
  fontFamily: MONO,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em',
} as const;

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: colors.accent,
      contrastText: colors.abyss,
    },
    secondary: {
      main: colors.purple,
      contrastText: colors.abyss,
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
    // Every level clears 4.5:1 on the page background, so nothing informational
    // is styled below the readable floor.
    text: {
      primary: colors.text,
      secondary: colors.ghost,
      disabled: colors.muted,
    },
    divider: colors.steel,
  },
  typography: {
    fontFamily: "'IBM Plex Sans', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h4: {
      fontWeight: 600,
      letterSpacing: '-0.03em',
    },
    h6: {
      fontWeight: 600,
      letterSpacing: '-0.015em',
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 3,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: 'none',
        },
        '::selection': {
          backgroundColor: accentAlpha(0.24),
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
          backgroundColor: colors.text,
          color: colors.void,
          fontSize: '0.75rem',
        },
        arrow: {
          color: colors.text,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(250, 250, 248, 0.88)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${colors.steel}`,
          color: colors.text,
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
