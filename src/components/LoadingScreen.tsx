import { CircularProgress } from '@mui/material';

export function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <CircularProgress size={32} sx={{ color: 'primary.main', mb: 2 }} />
      <p className="text-ghost text-sm">Loading tokens...</p>
    </div>
  );
}
