import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteScroll } from './useInfiniteScroll';

function mergeUnique(prev, batch, getItemId, seenRef) {
  if (!batch?.length) return prev;
  const next = [...prev];
  for (const item of batch) {
    const id = getItemId(item);
    if (!id || seenRef.current.has(id)) continue;
    seenRef.current.add(id);
    next.push(item);
  }
  return next;
}

/**
 * Paginated infinite load — fetches page-by-page, dedupes, stops forever when done.
 *
 * @param {object} opts
 * @param {(page: number) => Promise<{ results: unknown[], hasMore: boolean }>} opts.fetchPage
 * @param {(item: unknown) => string} opts.getItemId
 * @param {boolean} [opts.enabled] — set false to disable observer
 */
export function usePaginatedLoad({ fetchPage, getItemId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [stopped, setStopped] = useState(false);

  const pageRef = useRef(1);
  const loadingRef = useRef(false);
  const stoppedRef = useRef(false);
  const hasMoreRef = useRef(false);
  const seenRef = useRef(new Set());
  const fetchPageRef = useRef(fetchPage);
  const loadedPagesRef = useRef(new Set());
  const generationRef = useRef(0);

  fetchPageRef.current = fetchPage;
  hasMoreRef.current = hasMore;

  const markStopped = useCallback(() => {
    stoppedRef.current = true;
    hasMoreRef.current = false;
    setHasMore(false);
    setStopped(true);
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    pageRef.current = 1;
    loadingRef.current = false;
    stoppedRef.current = false;
    hasMoreRef.current = false;
    seenRef.current = new Set();
    loadedPagesRef.current = new Set();
    setItems([]);
    setLoading(false);
    setHasMore(false);
    setStopped(false);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || stoppedRef.current || !hasMoreRef.current) return;

    const page = pageRef.current;
    if (loadedPagesRef.current.has(page)) return;

    const gen = generationRef.current;
    loadingRef.current = true;
    loadedPagesRef.current.add(page);
    setLoading(true);

    try {
      const { results = [], hasMore: more = false } = await fetchPageRef.current(page);
      if (gen !== generationRef.current) return;

      setItems((prev) => mergeUnique(prev, results, getItemId, seenRef));

      if (!more || !results.length) {
        markStopped();
        return;
      }

      pageRef.current = page + 1;
      hasMoreRef.current = true;
      setHasMore(true);
    } catch (err) {
      if (gen !== generationRef.current) return;
      loadedPagesRef.current.delete(page);
      if (err?.name !== 'AbortError') throw err;
    } finally {
      if (gen === generationRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [getItemId, markStopped]);

  const begin = useCallback(async () => {
    pageRef.current = 1;
    loadingRef.current = false;
    stoppedRef.current = false;
    seenRef.current = new Set();
    loadedPagesRef.current = new Set();
    setItems([]);
    setLoading(false);
    setStopped(false);
    hasMoreRef.current = true;
    setHasMore(true);
    await loadMore();
  }, [loadMore]);

  const completeWithItems = useCallback((list) => {
    loadingRef.current = false;
    stoppedRef.current = true;
    hasMoreRef.current = false;
    seenRef.current = new Set();
    loadedPagesRef.current = new Set(['done']);
    for (const item of list) {
      const id = getItemId(item);
      if (id) seenRef.current.add(id);
    }
    setItems(list);
    setLoading(false);
    setHasMore(false);
    setStopped(true);
  }, [getItemId]);

  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore: hasMore && !stopped,
    loading,
    stopped,
  });

  // Chain-load when sentinel stays visible after a page finishes (short viewport).
  useEffect(() => {
    if (loading || stopped || !hasMore) return undefined;

    const el = sentinelRef.current;
    if (!el) return undefined;

    const frame = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 240) loadMore();
    });

    return () => cancelAnimationFrame(frame);
  }, [loading, stopped, hasMore, items.length, loadMore, sentinelRef]);

  return {
    items,
    setItems,
    loading,
    hasMore,
    stopped,
    loadMore,
    begin,
    completeWithItems,
    reset,
    sentinelRef,
  };
}
