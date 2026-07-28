import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, Filter, Inbox } from 'lucide-react';

interface EmptyStateProps {
  type: 'error' | 'empty';
  message: string;
  onRetry?: () => void;
  onReset?: () => void;
}

export function EmptyState({ type, message, onRetry, onReset }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
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
            <AlertCircle className="w-10 h-10 text-red" />
          ) : (
            <Inbox className="w-10 h-10 text-ghost" />
          )}
        </div>
      </div>

      <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
        {type === 'error' ? 'Something went wrong' : 'No tokens found'}
      </h3>

      <p className="text-ghost text-center max-w-md mb-6">{message}</p>

      <div className="flex items-center gap-3">
        {onRetry && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onRetry}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-sm text-accent font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </motion.button>
        )}

        {onReset && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onReset}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate hover:bg-steel border border-steel rounded-sm text-ghost hover:text-[var(--color-text)] font-medium transition-colors"
          >
            <Filter className="w-4 h-4" />
            Clear filters
          </motion.button>
        )}
      </div>

      {type === 'error' && (
        <div className="mt-8 p-4 bg-slate/50 rounded-sm border border-steel/50 max-w-md">
          <p className="text-xs text-ghost text-center">
            <span className="text-amber">Tip:</span> Make sure you have
            configured your <code className="text-[var(--color-text)]">DUNE_API_KEY</code>{' '}
            environment variable. You can get a free API key at{' '}
            <a
              href="https://dune.com/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue hover:underline"
            >
              dune.com/settings/api
            </a>
          </p>
        </div>
      )}
    </motion.div>
  );
}
