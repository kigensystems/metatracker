import { motion } from 'framer-motion';

interface AvailableDate {
  date: string;
  tokenCount: number;
  capturedAt: number;
}

interface DatePickerProps {
  selectedDate: string | null; // null = live/today
  availableDates: AvailableDate[];
  onDateChange: (date: string | null) => void;
  isLoading?: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function DatePicker({
  selectedDate,
  availableDates,
  onDateChange,
  isLoading = false,
}: DatePickerProps) {
  const today = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === null;

  // Sort all past dates by date descending, exclude today (today = live data)
  const historicalDates = availableDates
    .filter(d => d.tokenCount > 0 && d.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  // Get today's token count from available dates
  const todayData = availableDates.find(d => d.date === today);
  const todayCount = todayData?.tokenCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="mb-6"
    >
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {/* Today - always shown first */}
        <button
          onClick={() => onDateChange(null)}
          disabled={isLoading}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
            isToday
              ? 'bg-neon-green/20 text-neon-green border border-neon-green/40'
              : 'bg-slate/50 text-ghost border border-steel/30 hover:bg-slate hover:text-white'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span>Today</span>
          {todayCount !== undefined && (
            <span className={`ml-1.5 text-xs ${isToday ? 'text-neon-green/70' : 'text-ghost/50'}`}>
              {todayCount}
            </span>
          )}
        </button>

        {/* Historical dates */}
        {historicalDates.map(({ date, tokenCount }, index) => {
          const isSelected = selectedDate === date;
          return (
            <motion.button
              key={date}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => onDateChange(date)}
              disabled={isLoading}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                isSelected
                  ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/40'
                  : 'bg-slate/50 text-ghost border border-steel/30 hover:bg-slate hover:text-white'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span>{formatDate(date)}</span>
              <span className={`ml-1.5 text-xs ${isSelected ? 'text-neon-purple/70' : 'text-ghost/50'}`}>
                {tokenCount}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
