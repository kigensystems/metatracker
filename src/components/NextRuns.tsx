import { useEffect, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { FIGURE, LABEL } from '../lib/theme';
import { formatCountdown, nextPeakRead, nextTokenSync } from '../lib/schedule';

/** Ticks once a second so the countdowns actually count. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Countdown({ label, due, hint }: { label: string; due: string; hint: string }) {
  return (
    <Tooltip title={hint} arrow>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6 }}>
        <Typography sx={{ ...LABEL, color: 'text.disabled' }}>{label}</Typography>
        <Typography sx={{ ...FIGURE, fontSize: '0.75rem', fontWeight: 500, color: 'text.primary' }}>
          {due}
        </Typography>
      </Box>
    </Tooltip>
  );
}

/**
 * When the two background jobs are next due. Both are cron-driven, so this is
 * knowable ahead of time — but it is the schedule, not a promise that the run
 * has finished, which is what the tooltips say.
 */
export function NextRuns({ sx }: { sx?: SxProps<Theme> }) {
  const now = useNow();

  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2.5, ...sx }}>
      <Countdown
        label="Sync in"
        due={formatCountdown(nextTokenSync(now), now)}
        hint="The token sync runs every 2 hours, on even UTC hours. This is the schedule, not a guarantee the run has finished."
      />
      <Countdown
        label="Peak in"
        due={formatCountdown(nextPeakRead(now), now)}
        hint="The observed-peak reader runs hourly at :20 UTC. This is the schedule, not a guarantee the run has finished."
      />
    </Box>
  );
}
