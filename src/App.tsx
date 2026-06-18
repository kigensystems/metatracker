import { useState, useEffect, useCallback, useRef } from 'react';
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

interface CachedData {
  tokens: GraduatedToken[];
  lastUpdated: Date;
}

const ITEMS_PER_PAGE = 50;

function App() {
  const [tokens, setTokens] = useState<GraduatedToken[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [liveDataDate, setLiveDataDate] = useState<string | null>(null);
  const [liveTokenCount, setLiveTokenCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // Client-side cache for fetched data
  const cache = useRef<Map<string, CachedData>>(new Map());

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
  const fetchTokens = useCallback(async (bypassCache = false) => {
    const cacheKey = selectedDate || 'live';

    // Check client cache first unless the user explicitly refreshes.
    if (!bypassCache) {
      const cached = cache.current.get(cacheKey);
      if (cached) {
        setTokens(cached.tokens);
        if (cacheKey === 'live') {
          setLiveTokenCount(cached.tokens.length);
        }
        setLastUpdated(cached.lastUpdated);
        setLoading(false);
        setError(null);
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);

      const mode = selectedDate ? 'historical' : 'live';
      const params = new URLSearchParams({ mode });
      if (selectedDate) params.set('date', selectedDate);

      const response = await fetch(`${API_BASE}/graduated?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const fetchedTokens = data.tokens || [];
      const updatedAt = new Date(data.fetchedAt || data.capturedAt || Date.now());

      setTokens(fetchedTokens);
      setLastUpdated(updatedAt);

      // Store in cache
      cache.current.set(cacheKey, { tokens: fetchedTokens, lastUpdated: updatedAt });

      // Capture live metadata for the rolling 24h tab.
      if (mode === 'live' && data.snapshotDate) {
        setLiveDataDate(data.snapshotDate);
        setLiveTokenCount(fetchedTokens.length);
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
    setPage(1); // Reset to first page on date change
  }, []);

  // Sort tokens by market cap
  const sortedTokens = [...tokens].sort((a, b) => {
    const comparison = (b.marketCap || 0) - (a.marketCap || 0);
    return sortOrder === 'asc' ? -comparison : comparison;
  });

  // Pagination
  const totalPages = Math.ceil(sortedTokens.length / ITEMS_PER_PAGE);
  const paginatedTokens = sortedTokens.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  return (
    <div className="min-h-screen bg-void relative">
      <div className="relative z-10">
        <Header
          lastUpdated={lastUpdated}
          onRefresh={() => fetchTokens(true)}
          loading={loading}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className="pt-6">
            <DatePicker
              selectedDate={selectedDate}
              availableDates={availableDates}
              onDateChange={handleDateChange}
              isLoading={loading}
              liveDataDate={liveDataDate}
              liveTokenCount={liveTokenCount ?? undefined}
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
              tokens={paginatedTokens}
              totalCount={sortedTokens.length}
              sortOrder={sortOrder}
              onSortChange={setSortOrder}
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
