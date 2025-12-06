import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';

// X (formerly Twitter) icon
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
import type { GraduatedToken } from '../lib/types';

interface TokenRowProps {
  token: GraduatedToken;
  index: number;
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

function formatCreatedAt(timestamp: number | null | undefined): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function TokenRow({ token, index }: TokenRowProps) {
  const dexUrl = token.dexScreenerUrl || `https://dexscreener.com/solana/${token.mint}`;

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, '_blank');
  };

  const hasSocials = token.website || token.twitter;

  return (
    <motion.a
      href={dexUrl}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      className="grid grid-cols-[40px_48px_1fr_100px_100px] gap-4 px-4 py-3 hover:bg-slate/30 cursor-pointer transition-colors items-center"
    >
      {/* Row Number */}
      <div className="text-sm font-mono text-ghost">{index + 1}</div>

      {/* Token Image */}
      <div className="w-12 h-12 flex-shrink-0">
        {token.image ? (
          <img
            src={token.image}
            alt={token.symbol}
            className="w-12 h-12 rounded-lg object-cover border border-steel/50"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-slate border border-steel/50 flex items-center justify-center">
            <span className="text-sm font-bold text-ghost">
              {token.symbol?.slice(0, 2) || '??'}
            </span>
          </div>
        )}
      </div>

      {/* Token Name/Symbol */}
      <div className="min-w-0">
        <p className="font-medium text-white truncate">{token.name || 'Unknown'}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neon-amber font-mono">${token.symbol}</span>
          {token.createdAt && (
            <span className="text-xs text-ghost">{formatCreatedAt(token.createdAt)}</span>
          )}
        </div>
      </div>

      {/* Market Cap */}
      <div className="text-right">
        <p className="text-sm font-mono text-neon-green">{formatNumber(token.marketCap)}</p>
      </div>

      {/* Socials */}
      <div className="flex items-center justify-end gap-2">
        {hasSocials ? (
          <>
            {token.website && (
              <button
                onClick={(e) => handleLinkClick(e, token.website!)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-steel/50 transition-colors text-ghost hover:text-white"
                title="Website"
              >
                <Globe className="w-4 h-4" />
              </button>
            )}
            {token.twitter && (
              <button
                onClick={(e) => handleLinkClick(e, token.twitter!)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-steel/50 transition-colors text-ghost hover:text-white"
                title="X"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </>
        ) : (
          <span className="text-xs text-ghost/50">-</span>
        )}
      </div>
    </motion.a>
  );
}
