import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { searchMovies, preloadPopularSearches } from '../utils/api';
import { getSearchCache, getSearchSuggestions } from '../utils/searchCache';
import MovieCard from './MovieCard';

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 24;

export default function SearchPage({ onPlay, onInfo, onHoverPreload }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [suggestions, setSuggestions] = useState([]);

  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    preloadPopularSearches();
  }, []);

  const visibleResults = useMemo(
    () => results.slice(0, visibleCount),
    [results, visibleCount],
  );

  const runSearch = useCallback(async (q, { instant = false } = {}) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const cached = getSearchCache(trimmed);
    if (cached) {
      setResults(cached.results);
      setTotal(cached.total);
      setFromCache(true);
      setError('');
      setVisibleCount(PAGE_SIZE);
      if (instant) setLoading(false);
    } else if (!instant) {
      setLoading(true);
      setFromCache(false);
    }

    try {
      const { results: hits, total: count } = await searchMovies(trimmed, {
        signal: controller.signal,
        pages: 10,
      });
      if (controller.signal.aborted) return;

      setResults(hits);
      setTotal(count);
      setFromCache(false);
      setError('');
      setVisibleCount(PAGE_SIZE);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (!cached) {
        setResults([]);
        setTotal(0);
        setError('Search failed. Is the backend running on port 3001?');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    abortRef.current?.abort();

    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      setError('');
      setSuggestions([]);
      setLoading(false);
      setFromCache(false);
      return;
    }

    const cached = getSearchCache(q);
    if (cached) {
      setResults(cached.results);
      setTotal(cached.total);
      setFromCache(true);
      setLoading(false);
      setError('');
    } else {
      setLoading(true);
      setFromCache(false);
    }

    setSuggestions(getSearchSuggestions(q));

    timerRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    clearTimeout(timerRef.current);
    if (query.trim()) runSearch(query);
  };

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

      {suggestions.length > 0 && query.length >= 2 && !loading && results.length === 0 && (
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
                  runSearch(m.title, { instant: true });
                }}
              >
                {m.title}
              </button>
            ))}
          </motion.div>
        </div>
      )}

      {!loading && total > 0 && (
        <p className="search-count">
          {total} result{total !== 1 ? 's' : ''}
          {fromCache && <span className="search-cache-badge"> · instant</span>}
        </p>
      )}

      {error && <p className="search-error">{error}</p>}

      {loading && results.length === 0 && (
        <motion.div className="search-grid" aria-busy="true" aria-label="Loading results">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="search-skeleton-card skeleton" />
          ))}
        </motion.div>
      )}

      {results.length > 0 && (
        <>
          <motion.div
            className="search-grid search-grid-virtual"
            initial={loading ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {visibleResults.map((movie, i) => (
              <MovieCard
                key={movie.imdbId}
                movie={movie}
                index={i}
                onPlay={onPlay}
                onInfo={onInfo}
                onHoverPreload={onHoverPreload}
              />
            ))}
          </motion.div>

          {visibleCount < results.length && (
            <button
              type="button"
              className="btn-load-more glass-dark"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            >
              Show more ({results.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}

      {!loading && query && results.length === 0 && !error && (
        <p style={{ color: 'var(--txt-muted)' }}>
          No results for &quot;<strong style={{ color: '#fff' }}>{query}</strong>&quot;
        </p>
      )}
    </main>
  );
}
