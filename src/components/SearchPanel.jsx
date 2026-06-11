import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchMovies, fetchMovie, getPoster } from '../utils/api';
import MovieCard from './MovieCard';

export default function SearchPanel({ open, onClose, onPlay, onInfo, onWatchlist, watchlist }) {
  const inputRef = useRef(null);
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery(''); setResults([]);
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [open]);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const hits = await searchMovies(q);
      const detailed = await Promise.all(hits.slice(0, 10).map(h => fetchMovie(h.Title)));
      setResults(detailed.filter(Boolean));
      setLoading(false);
    }, 400);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="search"
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            position: 'fixed',
            top: 'var(--nav-h)', left: 0, right: 0,
            background: 'rgba(6,6,8,0.97)',
            backdropFilter: 'blur(24px) saturate(180%)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '1.2rem 4% 1.8rem',
            zIndex: 550,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.2rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={handleChange}
              placeholder="Search movies, shows, actors…"
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: '#fff', fontSize: '1.55rem',
                fontFamily: 'var(--font-body)', outline: 'none',
                letterSpacing: '-0.3px',
              }}
            />
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              style={{
                background: 'none', border: 'none',
                color: 'var(--txt2)', fontSize: '1.2rem', cursor: 'pointer',
              }}
            >✕</motion.button>
          </div>

          {/* Results */}
          {loading && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {Array.from({length: 6}).map((_, i) => (
                <div key={i} style={{
                  width: 150, height: 85, borderRadius: 6,
                  background: 'linear-gradient(90deg, var(--bg3) 25%, var(--bg4) 50%, var(--bg3) 75%)',
                  backgroundSize: '400% 100%', animation: 'shimmer 1.5s infinite',
                }} />
              ))}
              <style>{`@keyframes shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', maxHeight: '55vh', overflowY: 'auto' }}>
              {results.map((m, i) => (
                <motion.div
                  key={m.imdbID || i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <MovieCard
                    movie={m}
                    onPlay={onPlay}
                    onInfo={(movie) => { onInfo(movie); onClose(); }}
                    onWatchlist={onWatchlist}
                    inList={watchlist.some(w => w.imdbID === m.imdbID)}
                  />
                </motion.div>
              ))}
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <p style={{ color: 'var(--txt2)', fontSize: '0.95rem' }}>
              No results for "<span style={{ color: '#fff' }}>{query}</span>"
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
