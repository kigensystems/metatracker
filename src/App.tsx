import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { DatePicker } from './components/DatePicker';
import { TokenList } from './components/TokenList';
import { LoadingScreen } from './components/LoadingScreen';
import { EmptyState } from './components/EmptyState';
import type { GraduatedToken } from './lib/types';

const API_BASE = import.meta.env.DEV ? '/.netlify/functions' : '/api';

interface AvailableDate {
  date: string;
  tokenCount: number;
  capturedAt: number;
}

function App() {
  const [tokens, setTokens] = useState<GraduatedToken[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [liveDataDate, setLiveDataDate] = useState<string | null>(null); // Server's "today"

  // Fetch available dates for historical browsing
  const fetchAvailableDates = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/available-dates`);
      if (response.ok) {
        const data = await response.json();
        setAvailableDates(data.dates || []);
      }
    } catch (err) {
      console.error('Failed to fetch available dates:', err);
    }
  }, []);

  // Fetch tokens (supports live and historical modes)
  const fetchTokens = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const mode = selectedDate ? 'historical' : 'live';
      const params = new URLSearchParams({ mode });
      if (selectedDate) params.set('date', selectedDate);
      if (forceRefresh && !selectedDate) params.set('force', 'true');

      const response = await fetch(`${API_BASE}/graduated?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setTokens(data.tokens || []);
      setLastUpdated(new Date(data.fetchedAt || data.capturedAt || Date.now()));

      // Capture the server's date for live data (to filter from historical)
      if (mode === 'live' && data.snapshotDate) {
        setLiveDataDate(data.snapshotDate);
      }

      // Refresh available dates after a live fetch (new data might be stored)
      if (mode === 'live') {
        fetchAvailableDates();
      }
    } catch (err) {
      console.error('Failed to fetch tokens:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, fetchAvailableDates]);

  // Initial load
  useEffect(() => {
    fetchAvailableDates();
  }, [fetchAvailableDates]);

  // Fetch tokens when date changes
  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Handle date selection
  const handleDateChange = useCallback((date: string | null) => {
    setSelectedDate(date);
  }, []);

  // Sort tokens by market cap
  const sortedTokens = [...tokens].sort((a, b) => {
    const comparison = (b.marketCap || 0) - (a.marketCap || 0);
    return sortOrder === 'asc' ? -comparison : comparison;
  });

  return (
    <div className="min-h-screen bg-void relative">
      <div className="relative z-10">
        <Header
          tokenCount={tokens.length}
          lastUpdated={lastUpdated}
          onRefresh={() => fetchTokens(true)}
          loading={loading}
          selectedDate={selectedDate}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className="pt-6">
            <DatePicker
              selectedDate={selectedDate}
              availableDates={availableDates}
              onDateChange={handleDateChange}
              isLoading={loading}
              liveDataDate={liveDataDate}
            />
          </div>

          {loading ? (
            <LoadingScreen />
          ) : error ? (
            <EmptyState
              type="error"
              message={error}
              onRetry={fetchTokens}
            />
          ) : tokens.length === 0 ? (
            <EmptyState
              type="empty"
              message="No graduated tokens found"
            />
          ) : (
            <TokenList
              tokens={sortedTokens}
              sortOrder={sortOrder}
              onSortChange={setSortOrder}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
