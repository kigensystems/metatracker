import { Box } from '@mui/material';
import type { GraduatedToken } from '../lib/types';

import { tokenLinks } from '../lib/token-links';

interface RowActionsProps {
  token: GraduatedToken;
}

/**
 * Named links rather than icons. A globe and a candlestick both read as
 * "something external"; "Site" and "Chart" say where you land.
 */
export function RowActions({ token }: RowActionsProps) {
  const links = tokenLinks(token);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 0.4, minWidth: 0 }}>
      {links.map((link) => (
        <Box
          key={link.label}
          component="a"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.title}
          // The whole row opens the drawer; these links are the exception.
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          sx={{
            fontSize: '0.75rem',
            fontWeight: 500,
            lineHeight: 1,
            // Link-coloured, not grey: these are the point of the row.
            color: 'primary.main',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            '&:hover': { textDecoration: 'underline' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          {link.label}
        </Box>
      ))}
    </Box>
  );
}
