import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchStreamProviders, fetchEpisodes, fetchTvSeasons, saveWatchProgress, probeStreamUrls } from '../utils/api';
import { proxiedEmbedUrl } from '../utils/stream';

const LOAD_TIMEOUT = 10000;
const VIDSRC_PROGRESS_KEY = 'vidsrcwtf-Progress';

function streamLookupId(movie) {
  return movie?.imdbId || (movie?.tmdbId != null ? String(movie.tmdbId) : null);
}

function sortProviders(list) {
  return [...list].sort((a, b) => Number(b.working) - Number(a.working));
}

export default function Player({
  movie,
  season: initSeason,
  episode: initEpisode,
  onClose,
  onEpisodeChange,
}) {
  const [providers, setProviders] = useState([]);
  const [providerIndex, setProviderIndex] = useState(0);
  const [season, setSeason] = useState(initSeason || 1);
  const [episode, setEpisode] = useState(initEpisode || 1);
  const [showServer, setShowServer] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [episodes, setEpisodes] = useState([]);
  const [seasonsMeta, setSeasonsMeta] = useState([]);
  const [loadingEps, setLoadingEps] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [checkingServers, setCheckingServers] = useState(false);
  const iframeRef = useRef(null);
  const failTimerRef = useRef(null);
  const probeGenRef = useRef(0);
  const providerIndexRef = useRef(0);
  const endedRef = useRef(false);
  const isTv = movie?.type === 'tv' || movie?.Type === 'series';

  const maxSeasons = seasonsMeta.length || movie?.seasons || 10;

  useEffect(() => {
    if (initSeason != null) setSeason(initSeason);
  }, [initSeason]);

  useEffect(() => {
    if (initEpisode != null) setEpisode(initEpisode);
  }, [initEpisode]);

  const rankInBackground = useCallback(async (list) => {
    if (!list.length) return;
    const gen = ++probeGenRef.current;
    setCheckingServers(true);
    const checks = await probeStreamUrls(list.map((p) => p.url));
    if (gen !== probeGenRef.current) return;
    setProviders((prev) => {
      const ranked = sortProviders(
        list.map((p, i) => ({ ...p, working: checks[i] })),
      );
      const firstOk = ranked.findIndex((p) => p.working);
      if (firstOk >= 0 && firstOk !== providerIndexRef.current) {
        setProviderIndex(firstOk);
      }
      return ranked.length ? ranked : prev;
    });
    setCheckingServers(false);
  }, []);

  const loadProviders = useCallback(async () => {
    const lookupId = streamLookupId(movie);
    if (!lookupId) return;
    const s = isTv ? season : null;
    const e = isTv ? episode : null;
    try {
      const data = await fetchStreamProviders(lookupId, s, e);
      const list = data.providers || [];
      endedRef.current = false;
      if (!list.length) {
        setProviders([]);
        setLoadFailed(true);
        return;
      }
      setProviders(list);
      setProviderIndex(0);
      setLoadFailed(false);
      rankInBackground(list);
    } catch {
      setLoadFailed(true);
    }
  }, [movie, season, episode, isTv, rankInBackground]);

  const loadSeasonsMeta = useCallback(async () => {
    const lookupId = streamLookupId(movie);
    if (!isTv || !lookupId) return;
    try {
      const data = await fetchTvSeasons(lookupId, { imdbId: movie.imdbId, tmdbId: movie.tmdbId });
      if (data.seasons?.length) setSeasonsMeta(data.seasons);
    } catch {
      setSeasonsMeta([]);
    }
  }, [isTv, movie]);

  const loadEpisodeList = useCallback(async () => {
    const lookupId = streamLookupId(movie);
    if (!isTv || !lookupId) return;
    setLoadingEps(true);
    try {
      const list = await fetchEpisodes(movie.tmdbId || movie.imdbId, season, {
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
      });
      setEpisodes(list);
    } catch {
      setEpisodes([]);
    }
    setLoadingEps(false);
  }, [isTv, movie, season]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (!showEpisodes || !isTv) return;
    loadSeasonsMeta();
    loadEpisodeList();
  }, [showEpisodes, isTv, season, loadSeasonsMeta, loadEpisodeList]);

  const handleSeasonChange = (newSeason) => {
    const next = Number(newSeason);
    setSeason(next);
    setEpisode(1);
    onEpisodeChange?.({ season: next, episode: 1 });
    endedRef.current = false;
  };

  useEffect(() => {
    providerIndexRef.current = providerIndex;
  }, [providerIndex]);

  const currentProvider = providers[providerIndex];
  const embedSrc = currentProvider ? proxiedEmbedUrl(currentProvider.url) : '';

  const demoteAndTryNext = useCallback(() => {
    setProviders((prev) => {
      if (!prev.length) return prev;
      const failedName = prev[providerIndexRef.current]?.name;
      const updated = prev.map((p) => (p.name === failedName ? { ...p, working: false } : p));
      const ranked = sortProviders(updated);
      const nextIdx = ranked.findIndex((p) => p.working !== false);
      const tryIdx = nextIdx >= 0 ? nextIdx : (providerIndexRef.current + 1) % ranked.length;
      if (tryIdx !== providerIndexRef.current) {
        setProviderIndex(tryIdx);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
      return ranked;
    });
  }, []);

  useEffect(() => {
    clearTimeout(failTimerRef.current);
    if (!embedSrc) return;
    failTimerRef.current = setTimeout(demoteAndTryNext, LOAD_TIMEOUT);
    return () => clearTimeout(failTimerRef.current);
  }, [embedSrc, providerIndex, demoteAndTryNext]);

  const goToNextEpisode = useCallback(() => {
    if (!isTv) return;
    const maxEp = episodes.length || 12;
    let nextSeason = season;
    let nextEpisode = episode + 1;
    if (nextEpisode > maxEp) {
      nextSeason = season + 1;
      nextEpisode = 1;
    }
    if (nextSeason > maxSeasons) return;
    setSeason(nextSeason);
    setEpisode(nextEpisode);
    onEpisodeChange?.({ season: nextSeason, episode: nextEpisode });
    setShowEpisodes(false);
    endedRef.current = false;
  }, [isTv, episodes.length, season, episode, maxSeasons, onEpisodeChange]);

  useEffect(() => {
    const onMessage = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      const { type, currentTime, duration, progress: p } = e.data;

      if (type === 'MEDIA_DATA' && e.origin?.includes('vidsrc.wtf')) {
        try {
          localStorage.setItem(VIDSRC_PROGRESS_KEY, JSON.stringify(e.data));
        } catch { /* quota */ }
        const pct = p ?? e.data.progress ?? (duration ? (currentTime / duration) * 100 : 0);
        if (pct > 0) saveWatchProgress(movie, pct, season, episode);
        return;
      }

      if (type === 'timeupdate' || type === 'progress') {
        const pct = p ?? (duration ? (currentTime / duration) * 100 : 0);
        if (pct >= 5) saveWatchProgress(movie, pct, season, episode);
        if (isTv && pct >= 97 && !endedRef.current) {
          endedRef.current = true;
          setTimeout(goToNextEpisode, 1500);
        }
      }

      if (
        isTv &&
        !endedRef.current &&
        (type === 'ended' || type === 'video-ended' || type === 'complete')
      ) {
        endedRef.current = true;
        goToNextEpisode();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [movie, season, episode, isTv, goToNextEpisode]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickEpisode = (ep) => {
    setEpisode(ep);
    onEpisodeChange?.({ season, episode: ep });
    setShowEpisodes(false);
    endedRef.current = false;
  };

  const pickServer = (idx) => {
    setProviderIndex(idx);
    setLoadFailed(false);
  };

  if (!movie) return null;

  const title = movie.title || movie.Title || '';
  const epLabel = isTv ? ` · S${season} E${episode}` : '';
  const workingCount = providers.filter((p) => p.working).length;

  const seasonOptions = seasonsMeta.length
    ? seasonsMeta
    : Array.from({ length: maxSeasons }, (_, i) => ({ season: i + 1, episodeCount: 10 }));

  return (
    <motion.div
      className="player-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div className="player-top" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <button type="button" className="btn-back glass-dark" onClick={onClose}>
          ← Back
        </button>

        <motion.div className="player-title glass-dark">
          <span className="player-title-text">{title}{epLabel}</span>
        </motion.div>

        <motion.div className="player-top-actions">
          {isTv && (
            <button type="button" className="btn-glass-pill" onClick={() => setShowEpisodes((v) => !v)}>
              Episodes
            </button>
          )}
          <button type="button" className="btn-glass-pill" onClick={() => setShowServer((v) => !v)}>
            Server{workingCount > 0 ? ` (${workingCount})` : ''}
          </button>
          <button type="button" className="nav-icon-btn glass-dark" onClick={() => setShowServer((v) => !v)} aria-label="Menu">
            ☰
          </button>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showServer && (
          <motion.div
            className="server-panel glass-dark player-server-float"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <motion.div className="server-panel-header">
              <span>
                {checkingServers ? 'Checking servers…' : workingCount ? `${workingCount} server${workingCount > 1 ? 's' : ''} online` : 'Tap a server to switch'}
              </span>
              <button type="button" className="control-btn" onClick={() => setShowServer(false)}>Hide</button>
            </motion.div>
            <div className="server-list">
              {providers.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  className={`server-option${i === providerIndex ? ' active' : ''}${p.working ? ' server-ok' : p.working === false ? ' server-fail' : ''}`}
                  onClick={() => pickServer(i)}
                >
                  <span className={`server-dot${p.working ? ' ok' : ''}`} />
                  <span className="server-option-label">{p.label}</span>
                  {i === providerIndex && <span className="server-playing">Playing</span>}
                </button>
              ))}
            </div>
            {loadFailed && (
              <p className="server-hint" style={{ color: '#ff6b6b' }}>All servers failed — try another server.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="player-frame-wrap">
        {embedSrc ? (
          <iframe
            ref={iframeRef}
            key={`${currentProvider?.name}-${season}-${episode}`}
            src={embedSrc}
            title={title}
            allow="autoplay; fullscreen; encrypted-media"
            allowFullScreen
            onLoad={() => {
              clearTimeout(failTimerRef.current);
              setLoadFailed(false);
            }}
          />
        ) : (
          <motion.div className="player-loading">Loading stream…</motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {showEpisodes && isTv && (
          <motion.div
            className="episode-drawer glass-dark"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <motion.div className="episode-drawer-header">
              <h3>Episodes</h3>
              <select
                value={season}
                onChange={(e) => handleSeasonChange(e.target.value)}
                className="season-select"
              >
                {seasonOptions.map((s) => (
                  <option key={s.season} value={s.season}>
                    Season {s.season}{s.episodeCount ? ` (${s.episodeCount} EP)` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="control-btn" onClick={() => setShowEpisodes(false)}>✕</button>
            </motion.div>

            <motion.div className="episode-list">
              {loadingEps ? (
                <p className="loading-eps">Loading episodes for Season {season}…</p>
              ) : episodes.length === 0 ? (
                <p className="loading-eps">No episodes for Season {season}. Try another season or restart the backend.</p>
              ) : (
                episodes.map((ep) => (
                  <button
                    key={`${season}-${ep.episode}`}
                    type="button"
                    className={`episode-item${ep.episode === episode ? ' active' : ''}`}
                    onClick={() => pickEpisode(ep.episode)}
                  >
                    <span className="episode-num">{ep.episode}</span>
                    {ep.still && <img src={ep.still} alt="" className="episode-thumb" loading="lazy" />}
                    <motion.div className="episode-info">
                      <motion.div className="episode-info-top">
                        <strong>{ep.name}</strong>
                        {ep.runtime && <span>{ep.runtime}m</span>}
                      </motion.div>
                      {ep.overview && <p>{ep.overview}</p>}
                    </motion.div>
                  </button>
                ))
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
