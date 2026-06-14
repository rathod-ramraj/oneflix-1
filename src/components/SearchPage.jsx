import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { searchMoviesPage } from '../utils/api';
import { getSearchCache, setSearchCache, getSearchSuggestions } from '../utils/searchCache';
import { usePaginatedLoad } from '../hooks/usePaginatedLoad';
import MovieCard from './MovieCard';

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 24;

export default function SearchPage({ onPlay, onInfo }) {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [total, setTotal] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const activeQueryRef = useRef('');
  const completedQueryRef = useRef('');

  activeQueryRef.current = activeQuery;

  const fetchPage = useCallback(async (page) => {
    const q = activeQueryRef.current;
    if (!q) return { results: [], hasMore: false };

    const data = await searchMoviesPage(q, page, {
      signal: abortRef.current?.signal,
      limit: PAGE_SIZE,
    });

    if (page === 1) setTotal(data.total);

    return {
      results: data.results,
      hasMore: data.hasMore,
    };
  }, []);

  const {
    items: results,
    loading,
    hasMore,
    stopped,
    begin,
    completeWithItems,
    reset,
    sentinelRef,
  } = usePaginatedLoad({
    fetchPage,
    getItemId: (m) => m.imdbId,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!stopped || !activeQuery || !results.length) return;
    completedQueryRef.current = activeQuery;
    setSearchCache(activeQuery, { results, total: total || results.length });
  }, [stopped, activeQuery, results, total]);

  const clearSearch = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeQueryRef.current = '';
    completedQueryRef.current = '';
    setActiveQuery('');
    setQuery('');
    setTotal(0);
    setError('');
    setSuggestions([]);
    setFromCache(false);
    reset();
  }, [reset]);

  const launchSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (!trimmed) {
      clearSearch();
      return;
    }

    if (completedQueryRef.current === trimmed && activeQuery === trimmed && stopped) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError('');
    setFromCache(false);
    setActiveQuery(trimmed);
    activeQueryRef.current = trimmed;

    const cached = getSearchCache(trimmed);
    if (cached?.results?.length) {
      completedQueryRef.current = trimmed;
      setTotal(cached.total ?? cached.results.length);
      setFromCache(true);
      completeWithItems(cached.results);
      return;
    }

    completedQueryRef.current = '';
    reset();

    try {
      await begin();
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError('Search failed. Is the backend running on port 3001?');
    }
  }, [activeQuery, stopped, begin, completeWithItems, clearSearch, reset]);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);

    if (!q.trim()) {
      clearSearch();
      return;
    }

    setSuggestions(getSearchSuggestions(q));

    if (completedQueryRef.current === q.trim() && activeQuery === q.trim()) {
      return;
    }

    const cached = getSearchCache(q);
    if (cached?.results?.length && q.trim().length >= 2) {
      timerRef.current = setTimeout(() => launchSearch(q), DEBOUNCE_MS);
      return;
    }

    timerRef.current = setTimeout(() => launchSearch(q), DEBOUNCE_MS);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    clearTimeout(timerRef.current);
    if (query.trim()) launchSearch(query);
  };

  const initialLoading = loading && results.length === 0;

  return (
    <main className="search-page">
      <form className="search-input-wrap" onSubmit={handleSubmit}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          onChange={handleChange}
          placeholder="Search movies & TV shows…"
          autoComplete="off"
          spellCheck={false}
        />
      </form>

      {suggestions.length > 0 && query.length >= 2 && !initialLoading && results.length === 0 && !activeQuery && (
        <div className="search-suggestions glass-dark">
          <p className="search-suggestions-label">From cache</p>
          <motion.div className="search-suggestions-row">
            {suggestions.map((m) => (
              <button
                key={m.imdbId}
                type="button"
                className="search-suggestion-chip"
                onClick={() => {
                  setQuery(m.title);
                  launchSearch(m.title);
                }}
              >
                {m.title}
              </button>
            ))}
          </motion.div>
        </div>
      )}

      {!initialLoading && (total > 0 || results.length > 0) && (
        <p className="search-count">
          {total || results.length} result{(total || results.length) !== 1 ? 's' : ''}
          {fromCache && <span className="search-cache-badge"> · instant</span>}
          {stopped && !fromCache && activeQuery && (
            <span className="search-cache-badge"> · all loaded</span>
          )}
        </p>
      )}

      {error && <p className="search-error">{error}</p>}

      {initialLoading && (
        <motion.div className="search-grid" aria-busy="true" aria-label="Loading results">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="search-skeleton-card skeleton" />
          ))}
        </motion.div>
      )}

      {results.length > 0 && (
        <motion.div
          className="search-grid search-grid-virtual"
          initial={false}
          animate={{ opacity: 1 }}
        >
          {results.map((movie, i) => (
            <MovieCard
              key={movie.imdbId}
              movie={movie}
              index={i}
              animate={false}
              onPlay={onPlay}
              onInfo={onInfo}
            />
          ))}
        </motion.div>
      )}

      {activeQuery && hasMore && !stopped && (
        <div ref={sentinelRef} className="infinite-scroll-sentinel" aria-hidden />
      )}

      {loading && results.length > 0 && !stopped && (
        <div className="infinite-scroll-loader" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="search-skeleton-card skeleton" />
          ))}
        </div>
      )}

      {stopped && results.length > 0 && (
        <p className="search-end-label">All results loaded</p>
      )}

      {!loading && !initialLoading && activeQuery && results.length === 0 && !error && (
        <p style={{ color: 'var(--txt-muted)' }}>
          No results for &quot;<strong style={{ color: '#fff' }}>{activeQuery}</strong>&quot;
        </p>
      )}
    </main>
  );
}
