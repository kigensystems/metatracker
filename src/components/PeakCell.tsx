import { Typography } from '@mui/material';
import type { GraduatedToken } from '../lib/types';
import { FIGURE } from '../lib/theme';
import { formatUsd } from '../lib/format';
import { peakState } from '../lib/peak';

interface PeakCellProps {
  token: GraduatedToken;
}

/** Peak market cap, or an em dash when the source reported none. */
export function PeakCell({ token }: PeakCellProps) {
  const state = peakState(token);

  if (state.kind === 'unread') {
    return (
      <Typography
        // A native title: this renders on every row, and MUI's Tooltip would
        // mount an extra component per row for a hint that is rarely read.
        title="No peak reading available for this token."
        sx={{
          ...FIGURE,
          fontSize: '0.73rem',
          textAlign: 'right',
          whiteSpace: 'nowrap',
          color: 'text.disabled',
        }}
      >
        —
      </Typography>
    );
  }

  const cleared = state.kind === 'cleared';

  return (
    <Typography
      sx={{
        ...FIGURE,
        fontSize: '0.8125rem',
        fontWeight: cleared ? 600 : 400,
        textAlign: 'right',
        color: cleared ? 'primary.main' : 'text.secondary',
      }}
    >
      {formatUsd(state.value)}
    </Typography>
  );
}
