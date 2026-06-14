import { useEffect, useRef } from 'react';

/**
 * Intersection Observer infinite scroll.
 * Disconnects permanently when stopped=true (all data loaded).
 * Ref gates prevent re-fetch when scrolling up/down past the sentinel.
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  loading,
  stopped = false,
  rootMargin = '240px',
}) {
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);
  const onLoadMoreRef = useRef(onLoadMore);
  const gateRef = useRef({ hasMore, loading, stopped });

  onLoadMoreRef.current = onLoadMore;
  gateRef.current = { hasMore, loading, stopped };

  useEffect(() => {
    if (stopped || !hasMore) {
      observerRef.current?.disconnect();
      observerRef.current = null;
      return undefined;
    }

    const el = sentinelRef.current;
    if (!el) return undefined;

    observerRef.current?.disconnect();

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        const { hasMore: more, loading: busy, stopped: done } = gateRef.current;
        if (done || !more || busy) return;
        onLoadMoreRef.current();
      },
      { root: null, rootMargin, threshold: 0 },
    );

    observerRef.current = io;
    io.observe(el);

    return () => {
      io.disconnect();
      if (observerRef.current === io) observerRef.current = null;
    };
  }, [hasMore, stopped, rootMargin]);

  return sentinelRef;
}
