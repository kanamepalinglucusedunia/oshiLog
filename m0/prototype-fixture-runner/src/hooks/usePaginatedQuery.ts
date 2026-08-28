import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageCursor } from '@/repositories/cursor';
import { useUiStore } from '@/stores/uiStore';

export interface PaginatedFetchArgs<F, S> {
  filters: F;
  sort: S;
  limit: number;
  cursor: PageCursor;
}

export interface PaginatedFetchResult<T> {
  rows: T[];
  nextCursor: PageCursor;
  hasMore: boolean;
}

type FetchFn<F, S, T> = (args: PaginatedFetchArgs<F, S>) => PaginatedFetchResult<T>;

/**
 * Generic keyset pagination hook. Keeps loaded items in state and handles
 * cursor, hasMore, initial loading vs load-more, and refresh on filter/sort change.
 * Domain-specific wrappers should memoize `fetchFn` and pass stable filters/sort.
 */
export function usePaginatedQuery<F, S, T>(
  fetchFn: FetchFn<F, S, T>,
  filters: F,
  sort: S,
  limit = 50,
): {
  items: T[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
  totalCount?: number;
} {
  const dataVersion = useUiStore((s) => s.dataVersion);
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<PageCursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const filtersKey = JSON.stringify(filters);
  const sortKey = JSON.stringify(sort);

  const loadPage = useCallback(
    (nextCursor: PageCursor, append: boolean) => {
      const rid = ++requestIdRef.current;
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);
      setError(null);
      try {
        const result = fetchFn({ filters: JSON.parse(filtersKey) as F, sort: JSON.parse(sortKey) as S, limit, cursor: nextCursor });
        if (rid !== requestIdRef.current) return;
        setItems((prev) => (append ? [...prev, ...result.rows] : result.rows));
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
        setError(null);
      } catch (e) {
        if (rid !== requestIdRef.current) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (rid === requestIdRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [fetchFn, filtersKey, sortKey, limit],
  );

  const refresh = useCallback(() => {
    requestIdRef.current += 1;
    setItems([]);
    setCursor(null);
    setHasMore(true);
    loadPage(null, false);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore) return;
    loadPage(cursor, true);
  }, [cursor, hasMore, isLoading, isLoadingMore, loadPage]);

  // reload on filter/sort/dataVersion change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, sortKey, dataVersion, limit]);

  return { items, hasMore, isLoading, isLoadingMore, error, loadMore, refresh };
}
