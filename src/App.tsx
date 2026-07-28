import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { DatePicker } from './components/DatePicker';
import { MetaSummary } from './components/MetaSummary';
import { TokenList } from './components/TokenList';
import { FreshnessBar } from './components/FreshnessBar';
import { TokenDetailDrawer } from './components/TokenDetailDrawer';
import { LoadingScreen } from './components/LoadingScreen';
import { EmptyState } from './components/EmptyState';
import type { DataFreshness, GraduatedToken, SortKey } from './lib/types';
import { parseGraduatedPayload } from './lib/api-contract';

const API_BASE =
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? '/.netlify/functions' : '/api');

interface AvailableDate {
  date: string;
  tokenCount: number;
  capturedAt: number;
  captureMode?: string;
}

interface CachedData {
  tokens: GraduatedToken[];
  lastUpdated: Date;
  freshness: DataFreshness;
}

const ITEMS_PER_PAGE = 50;

function App() {
  const [tokens, setTokens] = useState<GraduatedToken[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('volume24h');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [liveDataDate, setLiveDataDate] = useState<string | null>(null);
  const [liveTokenCount, setLiveTokenCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [freshness, setFreshness] = useState<DataFreshness | null>(null);
  const [selectedToken, setSelectedToken] = useState<GraduatedToken | null>(null);

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
        setFreshness(cached.freshness);
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

      const {
        tokens: fetchedTokens,
        updatedAt,
        freshness: nextFreshness,
      } = parseGraduatedPayload(data);

      setTokens(fetchedTokens);
      setLastUpdated(updatedAt);
      setFreshness(nextFreshness);

      // Store in cache
      cache.current.set(cacheKey, {
        tokens: fetchedTokens,
        lastUpdated: updatedAt,
        freshness: nextFreshness,
      });

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
    setSelectedToken(null);
  }, []);

  // Sort by the active metric, pushing tokens missing that metric to the bottom.
  const sortedTokens = useMemo(() => {
    const arr = [...tokens];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return arr;
  }, [tokens, sortKey, sortDir]);

  // "Current meta" highlights, computed across the full set (not just the page).
  const summary = useMemo(() => {
    const maxBy = (key: SortKey) =>
      tokens.reduce<GraduatedToken | null>((best, token) => {
        const value = token[key];
        if (value == null) return best;
        const bestValue = best?.[key];
        return bestValue == null || bestValue < value ? token : best;
      }, null);
    const totalVolume = tokens.reduce((sum, token) => sum + (token.volume24h ?? 0), 0);
    return {
      topVolume: maxBy('volume24h'),
      topGainer: maxBy('priceChange24h'),
      topMarketCap: maxBy('marketCap'),
      totalVolume,
    };
  }, [tokens]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
      setPage(1);
    },
    [sortKey],
  );

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

        <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16">
          <div className="pt-8 sm:pt-12 pb-6">
            <h2 className="text-[1.75rem] sm:text-[2.15rem] leading-tight font-semibold tracking-[-0.035em] text-[#f1f3f4]">
              Recent graduates
            </h2>
            <p className="mt-2 max-w-2xl text-sm sm:text-[0.95rem] leading-6 text-[#9ba2ab]">
              Track every recently graduated token observed across the source snapshots. Open any token for sources, timing, and research links.
            </p>
          </div>

          <div>
            <DatePicker
              selectedDate={selectedDate}
              availableDates={availableDates}
              onDateChange={handleDateChange}
              isLoading={loading}
              liveDataDate={liveDataDate}
              liveTokenCount={liveTokenCount ?? undefined}
            />
          </div>

          <FreshnessBar freshness={error ? null : freshness} />

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
            <>
              <MetaSummary
                topVolume={summary.topVolume}
                topGainer={summary.topGainer}
                topMarketCap={summary.topMarketCap}
                totalVolume={summary.totalVolume}
                tokenCount={tokens.length}
                onSelect={setSelectedToken}
              />
              <TokenList
                tokens={paginatedTokens}
                totalCount={sortedTokens.length}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                onTokenSelect={setSelectedToken}
              />
            </>
          )}
        </main>
      </div>
      <TokenDetailDrawer
        token={selectedToken}
        open={selectedToken !== null}
        onClose={() => setSelectedToken(null)}
      />
    </div>
  );
}

export default App;
