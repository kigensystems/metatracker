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

const API_BASE =
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? '/.netlify/functions' : '/api');

interface AvailableDate {
  date: string;
  tokenCount: number;
  capturedAt: number;
}

interface CachedData {
  tokens: GraduatedToken[];
  lastUpdated: Date;
  freshness: DataFreshness;
}

const ITEMS_PER_PAGE = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildFreshness(data: Record<string, unknown>, totalCount: number): DataFreshness {
  const enrichmentData = isRecord(data.enrichment) ? data.enrichment : null;
  const enrichment = enrichmentData
    ? {
        failedCount: numberOrNull(enrichmentData.failedCount) ?? 0,
        successRate: numberOrNull(enrichmentData.successRate) ?? 0,
      }
    : null;

  const source = stringOrNull(data.source);
  const isStale = Boolean(data.isStale) || source === 'cache-stale';

  return {
    source,
    snapshotDate: stringOrNull(data.snapshotDate),
    fetchedAt: stringOrNull(data.fetchedAt),
    capturedAt: numberOrNull(data.capturedAt),
    duneExecutionEndedAt: stringOrNull(data.duneExecutionEndedAt),
    latestDuneExecutionEndedAt: stringOrNull(data.latestDuneExecutionEndedAt),
    isStale,
    staleReason: stringOrNull(data.staleReason),
    dateMode: stringOrNull(data.dateMode),
    totalCount: numberOrNull(data.totalCount) ?? totalCount,
    enrichment,
  };
}

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

      const fetchedTokens = data.tokens || [];
      const updatedAt = new Date(data.fetchedAt || data.capturedAt || Date.now());
      const nextFreshness = buildFreshness(data, fetchedTokens.length);

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
