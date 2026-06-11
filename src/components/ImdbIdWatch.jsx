import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchMovie } from '../utils/api';
import { parseMediaId } from '../utils/mediaId';

function ImdbIdIcon({ size = 22, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6 8h2v2H6zm0 6h2v2H6zm10-6h2v2h-2zm0 6h2v2h-2z" fill="currentColor" />
      <path
        d="M9 12h6M12 9v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { parseImdbId } from '../utils/mediaId';

export default function IdbIdWatch({ onPlay, onInfo, showToast }) {
  const [open, setOpen] = useState(false);
  const [mediaInput, setMediaInput] = useState('');
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [isTv, setIsTv] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleWatch = async (e) => {
    e?.preventDefault();
    const parsed = parseMediaId(mediaInput);
    if (!parsed) {
      showToast?.('Enter a valid IMDb (tt…) or TMDB (numeric) ID / URL');
      return;
    }

    const needsTvFields = isTv || parsed.type === 'tv';
    if (needsTvFields && (!season || !episode)) {
      showToast?.('TV needs season and episode');
      return;
    }

    setLoading(true);
    try {
      const movie = await fetchMovie(parsed.id);
      if (!movie) {
        showToast?.('Title not found — check the ID');
        return;
      }

      const playAsTv = movie.type === 'tv' || isTv || parsed.type === 'tv';
      if (playAsTv) {
        onPlay(
          { ...movie, type: 'tv' },
          { season: Number(season) || 1, episode: Number(episode) || 1 },
        );
      } else {
        onPlay(movie);
      }
      setOpen(false);
    } catch {
      showToast?.('Could not load title. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleDetails = async () => {
    const parsed = parseMediaId(mediaInput);
    if (!parsed) {
      showToast?.('Enter a valid IMDb or TMDB ID first');
      return;
    }
    setLoading(true);
    try {
      const movie = await fetchMovie(parsed.id);
      if (movie) {
        const asTv = isTv || movie.type === 'tv' || parsed.type === 'tv';
        onInfo(asTv ? { ...movie, type: 'tv' } : movie);
      } else showToast?.('Title not found');
    } catch {
      showToast?.('Could not load details');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div className="imdb-watch-dock" layout>
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.button
            key="toggle"
            type="button"
            className="imdb-watch-toggle glass-dark"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            aria-label="Watch by ID"
          >
            <span className="imdb-watch-toggle-icon">
              <ImdbIdIcon size={18} />
            </span>
            <span>Watch by ID</span>
          </motion.button>
        ) : (
          <motion.form
            key="panel"
            className="imdb-watch-panel glass-dark"
            onSubmit={handleWatch}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
          >
            <motion.div className="imdb-watch-panel-head">
              <div className="imdb-watch-panel-title">
                <span className="imdb-watch-panel-icon">
                  <ImdbIdIcon size={20} />
                </span>
                <strong>Watch by ID</strong>
              </div>
              <button type="button" className="imdb-watch-close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </motion.div>

            <p className="imdb-watch-hint">
              Paste an IMDb <code>tt…</code> ID, TMDB numeric ID, or full URL. TV needs season &amp; episode.
            </p>

            <input
              className="imdb-watch-input"
              value={mediaInput}
              onChange={(e) => setMediaInput(e.target.value)}
              placeholder="tt0372784, 533535, or URL"
              spellCheck={false}
              autoComplete="off"
            />

            <label className="imdb-watch-check">
              <input type="checkbox" checked={isTv} onChange={(e) => setIsTv(e.target.checked)} />
              TV series (season & episode)
            </label>

            {isTv && (
              <motion.div className="imdb-watch-tv-row" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <label>
                  Season
                  <input
                    type="number"
                    min={1}
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                  />
                </label>
                <label>
                  Episode
                  <input
                    type="number"
                    min={1}
                    value={episode}
                    onChange={(e) => setEpisode(e.target.value)}
                  />
                </label>
              </motion.div>
            )}

            <motion.div className="imdb-watch-actions">
              <button type="submit" className="btn-play imdb-watch-btn" disabled={loading}>
                {loading ? 'Loading…' : '▶ Watch'}
              </button>
              <button type="button" className="btn-glass-pill imdb-watch-btn-secondary" onClick={handleDetails} disabled={loading}>
                Details
              </button>
            </motion.div>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
