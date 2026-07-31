import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import InboxIcon from '@mui/icons-material/Inbox';
import RefreshIcon from '@mui/icons-material/Refresh';

interface EmptyStateProps {
  type: 'error' | 'empty';
  message: string;
  onRetry?: () => void;
  onReset?: () => void;
}

export function EmptyState({ type, message, onRetry, onReset }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="relative mb-6">
        {/* Icon container */}
        <div
          className={`relative w-20 h-20 rounded-sm flex items-center justify-center border ${
            type === 'error'
              ? 'bg-red/10 border-red/30'
              : 'bg-slate border-steel'
          }`}
        >
          {type === 'error' ? (
            <ErrorOutlineIcon className="text-red" sx={{ fontSize: 40 }} />
          ) : (
            <InboxIcon className="text-ghost" sx={{ fontSize: 40 }} />
          )}
        </div>
      </div>

      <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
        {type === 'error' ? 'Something went wrong' : 'No tokens found'}
      </h3>

      <p className="text-ghost text-center max-w-md mb-6">{message}</p>

      <div className="flex items-center gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-sm text-accent font-medium transition-colors"
          >
            <RefreshIcon sx={{ fontSize: 16 }} />
            Try again
          </button>
        )}

        {onReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate hover:bg-steel border border-steel rounded-sm text-ghost hover:text-[var(--color-text)] font-medium transition-colors"
          >
            <FilterAltOutlinedIcon sx={{ fontSize: 16 }} />
            Clear filters
          </button>
        )}
      </div>

      {type === 'error' && (
        <div className="mt-8 p-4 bg-slate/50 rounded-sm border border-steel/50 max-w-md">
          <p className="text-xs text-ghost text-center">
            <span className="text-amber">Tip:</span> The dashboard reads stored
            snapshots, so this usually means{' '}
            <code className="text-[var(--color-text)]">CONVEX_URL</code> is not
            configured or the scheduled sync has never run.
          </p>
        </div>
      )}
    </div>
  );
}
