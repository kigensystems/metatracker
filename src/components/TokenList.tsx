import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { TokenRow } from './TokenRow';
import type { GraduatedToken } from '../lib/types';

interface TokenListProps {
  tokens: GraduatedToken[];
  sortOrder: 'asc' | 'desc';
  onSortChange: (order: 'asc' | 'desc') => void;
}

export function TokenList({ tokens, sortOrder, onSortChange }: TokenListProps) {
  const toggleSort = () => {
    onSortChange(sortOrder === 'desc' ? 'asc' : 'desc');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Stats Bar */}
      <div className="flex items-center justify-between mb-4 px-1">
        <p className="text-sm text-ghost">
          Showing <span className="text-white font-mono">{tokens.length}</span>{' '}
          graduated tokens
        </p>
      </div>

      {/* Token Table */}
      <div className="bg-abyss/80 border border-steel/50 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[40px_48px_1fr_100px_100px] gap-4 px-4 py-3 bg-slate/50 border-b border-steel/30 text-xs text-ghost font-medium items-center">
          <div>#</div>
          <div></div>
          <div>Token</div>
          <button
            onClick={toggleSort}
            className="flex items-center justify-end gap-1 hover:text-white transition-colors cursor-pointer"
          >
            <span>Market Cap</span>
            {sortOrder === 'desc' ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
          <div className="text-right">Links</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-steel/20">
          {tokens.map((token, index) => (
            <TokenRow
              key={token.mint}
              token={token}
              index={index}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
