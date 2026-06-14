import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPoster, getBackdrop, fetchEpisodes, fetchTvSeasons, fetchMovie, fetchTrailer } from '../utils/api';
import { isInMyList, toggleMyList } from '../utils/myList';

import { useMediaQuery } from '../utils/useMedia';

export default function Modal({ movie, onClose, onPlay, onMyListChange, showToast }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [detail, setDetail] = useState(movie);
  const [episodes, setEpisodes] = useState([]);
  const [season, setSeason] = useState(1);
  const [seasonsMeta, setSeasonsMeta] = useState([]);
  const [loadingEps, setLoadingEps] = useState(false);
  const [inList, setInList] = useState(() => isInMyList(movie));
  const [trailer, setTrailer] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    if (!movie?.imdbId) return;
    setDetail(movie);
    setSeason(1);
    setInList(isInMyList(movie));
    setShowTrailer(false);
    setTrailer(null);
    if (!movie.plot && !movie.genre) {
      fetchMovie(movie.imdbId).then((d) => setDetail((prev) => ({ ...prev, ...d }))).catch(() => {});
    }
    fetchTrailer(movie.imdbId).then(setTrailer).catch(() => setTrailer(null));
  }, [movie]);

  const handleMyList = () => {
    const added = !isInMyList(detail);
    toggleMyList(detail);
    setInList(added);
    onMyListChange?.();
    showToast?.(added ? 'Added to My List' : 'Removed from My List');
  };

  useEffect(() => {
    if (detail?.type !== 'tv' || !detail?.imdbId) return;
    fetchTvSeasons(detail.imdbId, { imdbId: detail.imdbId, tmdbId: detail.tmdbId })
      .then((data) => { if (data.seasons?.length) setSeasonsMeta(data.seasons); })
      .catch(() => setSeasonsMeta([]));
  }, [detail]);

  useEffect(() => {
    if (detail?.type !== 'tv' || !detail?.imdbId) return;
    setLoadingEps(true);
    setEpisodes([]);
    fetchEpisodes(detail.tmdbId || detail.imdbId, season, {
      imdbId: detail.imdbId,
      tmdbId: detail.tmdbId,
    })
      .then(setEpisodes)
      .finally(() => setLoadingEps(false));
  }, [detail, season]);

  if (!detail) return null;

  const title = detail.title || '';
  const poster = getPoster(detail);
  const genres = detail.genre ? detail.genre.split(', ') : [];
  const match = detail.rating ? `${Math.round(parseFloat(detail.rating) * 10)}% match` : null;
  const isTv = detail.type === 'tv';
  const seasonOptions = seasonsMeta.length
    ? seasonsMeta
    : Array.from({ length: detail.seasons || 1 }, (_, i) => ({ season: i + 1, episodeCount: 10 }));

  return (
    <AnimatePresence>
      <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div
          className="modal-box glass-dark"
          onClick={(e) => e.stopPropagation()}
          initial={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, scale: 0.92, y: 40 }}
          animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1, y: 0 }}
          exit={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, scale: 0.95, y: 20 }}
          transition={isMobile ? { type: 'spring', damping: 32, stiffness: 380 } : { type: 'spring', damping: 26, stiffness: 320 }}
        >
          <button type="button" className="modal-close" onClick={onClose}>✕</button>

          <motion.div className="modal-hero">
            {showTrailer && trailer?.embedUrl ? (
              <iframe
                className="modal-trailer-embed"
                src={`${trailer.embedUrl}&autoplay=1`}
                title={`${title} trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <img src={getBackdrop(detail) || poster} alt={title} />
            )}
            {!showTrailer && <motion.div className="modal-hero-gradient" />}
            <motion.div className="modal-hero-content">
              {!showTrailer && <h2 className="modal-title">{title.toUpperCase()}</h2>}
              <motion.div className="modal-actions">
                {!showTrailer && (
                  <button type="button" className="btn-play" onClick={() => onPlay(detail, { season: 1, episode: 1 })}>▶ Play</button>
                )}
                {trailer && (
                  <button
                    type="button"
                    className={showTrailer ? 'btn-play' : 'btn-info'}
                    onClick={() => setShowTrailer((v) => !v)}
                  >
                    {showTrailer ? '◀ Back' : '▶ Trailer'}
                  </button>
                )}
                {!showTrailer && (
                  <>
                    <button
                      type="button"
                      className={`btn-icon-round glass${inList ? ' active' : ''}`}
                      onClick={handleMyList}
                      aria-label={inList ? 'Remove from My List' : 'Add to My List'}
                    >
                      {inList ? '✓' : '+'}
                    </button>
                    <button type="button" className="btn-icon-round glass">👍</button>
                  </>
                )}
              </motion.div>
            </motion.div>
          </motion.div>

          <motion.div className="modal-body">
            <motion.div className="modal-meta-row">
              {match && <span className="match-green">{match}</span>}
              {detail.year && <span>{detail.year}</span>}
              {isTv && <span>{seasonOptions.length} Seasons</span>}
              <span className="badge-hd">HD</span>
            </motion.div>

            <motion.div className="modal-grid">
              <motion.div>
                <p className="modal-plot">{detail.plot || 'No description available.'}</p>
                <motion.div className="modal-tags">
                  {genres.map((g) => <span key={g} className="tag-pill">{g.trim()}</span>)}
                </motion.div>
              </motion.div>
              <motion.div className="modal-side">
                {detail.cast && <p><strong>Cast:</strong> {detail.cast}</p>}
                {detail.director && <p><strong>Director:</strong> {detail.director}</p>}
                {detail.genre && <p><strong>Genres:</strong> {detail.genre}</p>}
              </motion.div>
            </motion.div>

            {isTv && (
              <section className="modal-episodes">
                <motion.div className="modal-episodes-header">
                  <h3>Episodes</h3>
                  <select value={season} onChange={(e) => setSeason(Number(e.target.value))} className="season-select">
                    {seasonOptions.map((s) => (
                      <option key={s.season} value={s.season}>
                        Season {s.season}{s.episodeCount ? ` (${s.episodeCount} EP)` : ''}
                      </option>
                    ))}
                  </select>
                </motion.div>
                <motion.div className="modal-episode-list">
                  {loadingEps ? (
                    <p className="loading-eps">Loading Season {season} episodes…</p>
                  ) : episodes.length === 0 ? (
                    <p className="loading-eps">No episodes for this season.</p>
                  ) : (
                    episodes.map((ep) => (
                      <button
                        key={`${season}-${ep.episode}`}
                        type="button"
                        className="modal-episode-item"
                        onClick={() => onPlay(detail, { season, episode: ep.episode })}
                      >
                        <span className="ep-num">{ep.episode}</span>
                        {ep.still && <img src={ep.still} alt="" loading="lazy" />}
                        <motion.div className="ep-text">
                          <motion.div className="ep-title-row">
                            <strong>{ep.name}</strong>
                            {ep.runtime && <span>{ep.runtime}m</span>}
                          </motion.div>
                          {ep.overview && <p>{ep.overview}</p>}
                        </motion.div>
                      </button>
                    ))
                  )}
                </motion.div>
              </section>
            )}
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
