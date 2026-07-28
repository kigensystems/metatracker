import { Typography } from '@mui/material';
import type { GraduatedToken } from '../lib/types';
import { FIGURE } from '../lib/theme';
import { formatUsd } from '../lib/format';
import { peakState } from '../lib/peak';

interface PeakCellProps {
  token: GraduatedToken;
}

/**
 * Observed peak market cap. A missing value means one of two different things,
 * so it says which: a token younger than a day is queued for the reader, not
 * missing from it.
 */
export function PeakCell({ token }: PeakCellProps) {
  const state = peakState(token);

  if (state.kind === 'scheduled' || state.kind === 'unread') {
    const scheduled = state.kind === 'scheduled';
    return (
      <Typography
        // A native title: this renders on every row, and MUI's Tooltip would
        // mount an extra component per row for a hint that is rarely read.
        title={
          scheduled
            ? 'Peak is read once the token is a day old.'
            : 'No peak reading available for this token.'
        }
        sx={{
          ...FIGURE,
          fontSize: '0.73rem',
          textAlign: 'right',
          whiteSpace: 'nowrap',
          color: 'text.disabled',
        }}
      >
        {scheduled ? 'after 24h' : '—'}
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
