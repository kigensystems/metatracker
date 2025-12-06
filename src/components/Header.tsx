import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

interface HeaderProps {
  tokenCount: number;
  lastUpdated: Date | null;
  onRefresh: () => void;
  loading: boolean;
  selectedDate: string | null; // null = today/live
}

export function Header({
  tokenCount,
  lastUpdated,
  onRefresh,
  loading,
  selectedDate,
}: HeaderProps) {
  const [timeUntilSync, setTimeUntilSync] = useState('');

  // Calculate time until next sync (00:00 or 12:00 UTC)
  useEffect(() => {
    const calculateTimeUntilSync = () => {
      const now = new Date();
      const utcHours = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();

      // Next sync is either 00:00 or 12:00 UTC
      let hoursUntil: number;
      if (utcHours < 12) {
        hoursUntil = 12 - utcHours - (utcMinutes > 0 ? 1 : 0);
      } else {
        hoursUntil = 24 - utcHours + (utcMinutes > 0 ? -1 : 0);
      }
      const minutesUntil = utcMinutes > 0 ? 60 - utcMinutes : 0;

      if (hoursUntil === 0 && minutesUntil <= 1) {
        return 'Syncing soon';
      } else if (hoursUntil === 0) {
        return `${minutesUntil}m`;
      } else {
        return `${hoursUntil}h ${minutesUntil}m`;
      }
    };

    setTimeUntilSync(calculateTimeUntilSync());
    const interval = setInterval(() => {
      setTimeUntilSync(calculateTimeUntilSync());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const formatRelativeTime = (date: Date | null): string => {
    if (!date) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${diffHours}h ago`;
  };

  const formatDisplayDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Today';
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (dateStr === today) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';

    const date = new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  return (
    <header className="sticky top-0 z-50 bg-abyss/90 backdrop-blur-xl border-b border-steel/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5"
          >
            <img
              src="/logo.png"
              alt="meta.tracker"
              className="w-8 h-8 sm:w-9 sm:h-9 object-contain image-pixelated"
            />
            <h1 className="font-pixel text-[10px] sm:text-xs tracking-wide">
              <span className="text-white">META</span>
              <span className="text-neon-green text-glow-green">.TRACKER</span>
            </h1>
          </motion.div>

          {/* Right side */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 sm:gap-4"
          >
            {/* Date + Token count */}
            <div className="text-sm flex items-center gap-2">
              <span className={`font-medium ${selectedDate ? 'text-neon-purple' : 'text-neon-green'}`}>
                {formatDisplayDate(selectedDate)}
              </span>
              <span className="text-ghost">·</span>
              <span>
                <span className="font-mono text-white font-semibold">{tokenCount}</span>
                <span className="text-ghost ml-1 hidden sm:inline">tokens</span>
              </span>
            </div>

            {/* Last updated */}
            {lastUpdated && (
              <>
                <div className="w-px h-4 bg-steel/50 hidden sm:block" />
                <span className="text-xs text-ghost hidden sm:block">
                  {formatRelativeTime(lastUpdated)}
                </span>
              </>
            )}

            {/* Next sync countdown */}
            <div className="w-px h-4 bg-steel/50 hidden sm:block" />
            <div className="text-xs text-ghost hidden sm:flex items-center gap-1.5">
              <span>Next</span>
              <span className="text-white font-mono">{timeUntilSync}</span>
            </div>

            {/* Refresh */}
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate/80 border border-steel/50 hover:border-neon-green/40 hover:bg-slate transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <RefreshCw
                className={`w-4 h-4 text-ghost group-hover:text-neon-green transition-colors ${
                  loading ? 'animate-spin' : ''
                }`}
              />
            </button>
          </motion.div>
        </div>
      </div>

      {/* Loading bar */}
      {loading && (
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 2, ease: 'easeInOut' }}
          className="h-0.5 bg-gradient-to-r from-neon-green via-neon-blue to-neon-purple origin-left"
        />
      )}
    </header>
  );
}
