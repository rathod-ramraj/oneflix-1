import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import './index.css';

import Navbar from './components/Navbar';
import Hero from './components/Hero';
import MovieRow from './components/MovieRow';
import Modal from './components/Modal';
import Player from './components/Player';
import SearchPage from './components/SearchPage';
import Footer from './components/Footer';
import ImdbIdWatch from './components/ImdbIdWatch';
import Toast from './components/Toast';

import { fetchRows, fetchMovie, getContinueWatching } from './utils/api';
import { proxiedEmbedUrl } from './utils/stream';
import { fetchStreamProviders } from './utils/api';

const PAGE = { HOME: 'home', SEARCH: 'search' };
const HERO_EXCLUDE = (m) =>
  m?.imdbId === 'tt4154796' || /avengers:\s*endgame/i.test(m?.title || '');

export default function App() {
  const [page, setPage] = useState(PAGE.HOME);
  const [navActive, setNavActive] = useState('home');
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [heroMovie, setHeroMovie] = useState(null);
  const [heroPool, setHeroPool] = useState([]);
  const heroIndexRef = useRef(0);
  const [modal, setModal] = useState(null);
  const [playerMovie, setPlayerMovie] = useState(null);
  const [playerSeason, setPlayerSeason] = useState(1);
  const [playerEpisode, setPlayerEpisode] = useState(1);
  const [toastMsg, setToastMsg] = useState('');
  const [filteredMovies, setFilteredMovies] = useState(null);
  const [continueWatching, setContinueWatching] = useState([]);
  const preloadRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800);
  }, []);

  const resolveHero = useCallback((data, pool) => {
    const fromApi = data.hero;
    if (fromApi && !HERO_EXCLUDE(fromApi)) return fromApi;
    return (
      pool.find((m) => m.title === 'Stranger Things') ||
      pool.find((m) => m.imdbId === 'tt4574334') ||
      pool[0] ||
      null
    );
  }, []);

  const buildHeroPool = useCallback((data) => {
    const seen = new Set();
    const pool = [];
    const add = (m) => {
      if (!m?.imdbId || seen.has(m.imdbId) || HERO_EXCLUDE(m)) return;
      seen.add(m.imdbId);
      pool.push(m);
    };
    if (data.hero) add(data.hero);
    if (data.heroes?.length) data.heroes.forEach(add);
    return pool;
  }, []);

  const loadHomeRows = useCallback(async (silent = false) => {
    try {
      const data = await fetchRows();
      const list = data.rows || data;
      const pool = buildHeroPool(data).filter(
        (m) => !HERO_EXCLUDE(m) && (m.backdrop || m.poster) && m.backdrop !== 'N/A'
      );
      setRows(list);
      const hero = resolveHero(data, pool);
      if (!silent) {
        setHeroPool(pool);
        heroIndexRef.current = 0;
        setHeroMovie(hero);
      } else {
        setHeroPool((prev) => {
          const merged = prev.filter((m) => !HERO_EXCLUDE(m));
          pool.forEach((m) => {
            if (!merged.some((x) => x.imdbId === m.imdbId)) merged.push(m);
          });
          return merged.length ? merged : pool;
        });
      }
    } catch (e) {
      console.error(e);
      if (!silent) showToast('Could not load catalog — is the backend running?');
    } finally {
      setLoadingRows(false);
    }
  }, [showToast, buildHeroPool, resolveHero]);

  useEffect(() => {
    loadHomeRows();
    setContinueWatching(getContinueWatching());
    const timer = setInterval(() => {
      if (page === PAGE.HOME) loadHomeRows(true);
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [loadHomeRows, page]);

  useEffect(() => {
    if (page !== PAGE.HOME || filteredMovies || heroPool.length < 2) return undefined;
    const timer = setInterval(() => {
      heroIndexRef.current = (heroIndexRef.current + 1) % heroPool.length;
      const next = heroPool[heroIndexRef.current];
      if (next && !HERO_EXCLUDE(next)) setHeroMovie(next);
    }, 8000);
    return () => clearInterval(timer);
  }, [page, filteredMovies, heroPool]);

  const handleNavigate = useCallback((id) => {
    setNavActive(id);
    setPage(PAGE.HOME);
    if (id === 'home' || id === 'games' || id === 'livetv' || id === 'torrents' || id === 'languages') {
      setFilteredMovies(null);
    } else if (id === 'movies') setFilteredMovies('movie');
    else if (id === 'tv') setFilteredMovies('tv');
    else if (id === 'anime') setFilteredMovies('anime');
    else if (id === 'mylist') setFilteredMovies('mylist');
  }, []);

  const handleSearchNav = useCallback(() => {
    setPage(PAGE.SEARCH);
    setNavActive('search');
  }, []);

  const handlePlay = useCallback((movie, opts = {}) => {
    setModal(null);
    setPlayerMovie(movie);
    setPlayerSeason(opts.season || 1);
    setPlayerEpisode(opts.episode || 1);
    document.body.style.overflow = 'hidden';
    showToast(`Now playing: ${movie.title}`);
  }, [showToast]);

  const closePlayer = useCallback(() => {
    setPlayerMovie(null);
    document.body.style.overflow = '';
    setContinueWatching(getContinueWatching());
  }, []);

  const handleEpisodeChange = useCallback(({ season, episode }) => {
    setPlayerSeason(season);
    setPlayerEpisode(episode);
    showToast(`S${season} E${episode}`);
  }, [showToast]);

  const handleInfo = useCallback(async (movie) => {
    setModal(movie);
    document.body.style.overflow = 'hidden';
    try {
      const full = await fetchMovie(movie.imdbId);
      if (full) setModal(full);
    } catch { /* keep partial */ }
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    if (!playerMovie) document.body.style.overflow = '';
  }, [playerMovie]);

  const handleHoverPreload = useCallback(async (movie) => {
    try {
      const lookupId = movie.imdbId || (movie.tmdbId != null ? String(movie.tmdbId) : null);
      if (!lookupId) return;
      const data = await fetchStreamProviders(lookupId);
      const url = data.providers?.[0]?.url;
      if (!url || preloadRef.current) return;
      const iframe = document.createElement('iframe');
      iframe.src = proxiedEmbedUrl(url);
      iframe.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
      document.body.appendChild(iframe);
      preloadRef.current = iframe;
      setTimeout(() => {
        iframe.remove();
        preloadRef.current = null;
      }, 8000);
    } catch { /* ignore */ }
  }, []);

  const displayRows = useMemo(() => {
    if (!filteredMovies) return rows;
    if (filteredMovies === 'mylist') return [];
    if (filteredMovies === 'anime') {
      return rows
        .map((row) => ({
          ...row,
          movies: row.movies.filter((m) => {
            const g = (m.genre || '').toLowerCase();
            return g.includes('animation') || g.includes('anime') || g.includes('fantasy');
          }),
        }))
        .filter((row) => row.movies.length > 0);
    }

    const filtered = rows
      .map((row) => ({
        ...row,
        movies: row.movies.filter((m) => m.type === filteredMovies),
      }))
      .filter((row) => row.movies.length > 0);

    if (filteredMovies === 'tv') {
      return [...filtered].sort((a, b) => (a.id === 'tv' ? -1 : b.id === 'tv' ? 1 : 0));
    }
    if (filteredMovies === 'movie') {
      return [...filtered].sort((a, b) => (a.id === 'top10' || a.id === 'toprated' ? -1 : 0));
    }
    return filtered;
  }, [rows, filteredMovies]);

  useEffect(() => {
    if (!rows.length) return;

    const pool = displayRows.flatMap((r) => r.movies);
    if (!pool.length) return;

    const pick =
      filteredMovies === 'movie'
        ? pool.find((m) => m.type === 'movie')
        : filteredMovies === 'tv'
          ? pool.find((m) => m.type === 'tv')
          : rows.find((r) => r.movies?.length)?.movies?.[0];

    if (pick && filteredMovies) setHeroMovie(pick);
  }, [filteredMovies, rows, displayRows]);

  const browseContent = (
    <>
      <Navbar active={navActive} onNavigate={handleNavigate} onSearch={handleSearchNav} />
      {page === PAGE.SEARCH ? (
        <>
          <SearchPage onPlay={handlePlay} onInfo={handleInfo} onHoverPreload={handleHoverPreload} />
          <Footer />
        </>
      ) : (
        <>
          <Hero movie={heroMovie} onPlay={handlePlay} onInfo={handleInfo} />
          <main className="main-content">
            {continueWatching.length > 0 && !filteredMovies && (
              <MovieRow
                title="Continue Watching"
                movies={continueWatching.map((m) => ({
                  ...m,
                  episodeLabel: m.type === 'tv' ? `S${m.season || 1}E${m.episode || 1}` : null,
                }))}
                loading={false}
                onPlay={(m) => handlePlay(m, { season: m.season, episode: m.episode })}
                onInfo={handleInfo}
                onHoverPreload={handleHoverPreload}
              />
            )}
            {displayRows.map((row) => (
              <MovieRow
                key={row.id}
                title={row.title}
                movies={row.movies}
                variant={row.variant || 'landscape'}
                exploreLink={row.explore}
                loading={loadingRows}
                onPlay={handlePlay}
                onInfo={handleInfo}
                onHoverPreload={handleHoverPreload}
              />
            ))}
          </main>
          <Footer />
        </>
      )}
    </>
  );

  return (
    <>
      {!playerMovie && browseContent}

      <AnimatePresence>
        {playerMovie && (
          <Player
            key={playerMovie.imdbId}
            movie={playerMovie}
            season={playerSeason}
            episode={playerEpisode}
            onClose={closePlayer}
            onEpisodeChange={handleEpisodeChange}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modal && !playerMovie && (
          <Modal
            movie={modal}
            onClose={closeModal}
            onPlay={handlePlay}
          />
        )}
      </AnimatePresence>

      {!playerMovie && (
        <ImdbIdWatch onPlay={handlePlay} onInfo={handleInfo} showToast={showToast} />
      )}

      <Toast message={toastMsg} />
    </>
  );
}
