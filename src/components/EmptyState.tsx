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
        {/* Background glow */}
        <div
          className={`absolute inset-0 rounded-full blur-2xl ${
            type === 'error' ? 'bg-neon-red/10' : 'bg-neon-blue/10'
          }`}
        />

        {/* Icon container */}
        <div
          className={`relative w-20 h-20 rounded-2xl flex items-center justify-center border ${
            type === 'error'
              ? 'bg-neon-red/10 border-neon-red/30'
              : 'bg-slate border-steel'
          }`}
        >
          {type === 'error' ? (
            <AlertCircle className="w-10 h-10 text-neon-red" />
          ) : (
            <Inbox className="w-10 h-10 text-ghost" />
          )}
        </div>
      </div>

      <h3 className="text-lg font-semibold text-white mb-2">
        {type === 'error' ? 'Something went wrong' : 'No tokens found'}
      </h3>

      <p className="text-ghost text-center max-w-md mb-6">{message}</p>

      <div className="flex items-center gap-3">
        {onRetry && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onRetry}
            className="flex items-center gap-2 px-5 py-2.5 bg-neon-green/10 hover:bg-neon-green/20 border border-neon-green/30 rounded-lg text-neon-green font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </motion.button>
        )}

        {onReset && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onReset}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate hover:bg-steel border border-steel rounded-lg text-ghost hover:text-white font-medium transition-colors"
          >
            <Filter className="w-4 h-4" />
            Reset Filters
          </motion.button>
        )}
      </div>

      {type === 'error' && (
        <div className="mt-8 p-4 bg-slate/50 rounded-lg border border-steel/50 max-w-md">
          <p className="text-xs text-ghost text-center">
            <span className="text-neon-amber">Tip:</span> Make sure you have
            configured your <code className="text-white">DUNE_API_KEY</code>{' '}
            environment variable. You can get a free API key at{' '}
            <a
              href="https://dune.com/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon-blue hover:underline"
            >
              dune.com/settings/api
            </a>
          </p>
        </div>
      )}
    </motion.div>
  );
}
