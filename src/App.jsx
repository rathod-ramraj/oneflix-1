import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

import Navbar from './components/Navbar';
import Hero from './components/Hero';
import MovieRow from './components/MovieRow';
import Footer from './components/Footer';
import Toast from './components/Toast';
import LanguagesBrowse from './components/LanguagesBrowse';

const Modal = lazy(() => import('./components/Modal'));
const Player = lazy(() => import('./components/Player'));
const SearchPage = lazy(() => import('./components/SearchPage'));
const ImdbIdWatch = lazy(() => import('./components/ImdbIdWatch'));

import { getContinueWatching, getSavedResume, prefetchStream } from './utils/api';
import { getMyList } from './utils/myList';
import { movieMatchesLanguage, languageLabel, LANGUAGES } from './utils/languages';
import { getHomeData, loadHomeOnce, resetHomeBootstrap, persistHomeSnapshot } from './utils/homeStore';

const PAGE = { HOME: 'home', SEARCH: 'search' };
const HERO_EXCLUDE = (m) =>
  m?.imdbId === 'tt4154796' || /avengers:\s*endgame/i.test(m?.title || '');

function parseYear(m) {
  const match = String(m?.year || '').match(/\d{4}/);
  return match ? parseInt(match[0], 10) : 0;
}

function buildHeroRotationPool(rows, data) {
  const seen = new Set();
  const pool = [];
  const add = (m) => {
    const key = m?.imdbId || (m?.tmdbId != null ? `tmdb:${m.tmdbId}` : null);
    if (!key || seen.has(key) || HERO_EXCLUDE(m)) return;
    if (!m.poster && !m.backdrop) return;
    seen.add(key);
    pool.push(m);
  };

  if (data?.hero) add(data.hero);
  if (data?.heroes?.length) data.heroes.forEach(add);

  const priorityIds = ['latest-movies', 'latest-tv', 'top-movies', 'top-tv'];
  for (const id of priorityIds) {
    const row = rows.find((r) => r.id === id);
    row?.movies?.forEach(add);
  }

  const all = rows.flatMap((r) => r.movies || []);
  const cutoff = new Date().getFullYear() - 2;

  [...all]
    .filter((m) => m.recent || parseYear(m) >= cutoff)
    .sort((a, b) => {
      if (a.recent && !b.recent) return -1;
      if (b.recent && !a.recent) return 1;
      return parseYear(b) - parseYear(a);
    })
    .forEach(add);

  [...all]
    .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
    .forEach(add);

  const movies = all.filter((m) => m.type === 'movie');
  const tv = all.filter((m) => m.type === 'tv');
  for (let i = 0; i < Math.max(movies.length, tv.length); i += 1) {
    if (movies[i]) add(movies[i]);
    if (tv[i]) add(tv[i]);
  }

  return pool.slice(0, 18);
}

function buildHeroPool(data) {
  const seen = new Set();
  const pool = [];
  const add = (m) => {
    if (!m?.imdbId || seen.has(m.imdbId) || HERO_EXCLUDE(m)) return;
    seen.add(m.imdbId);
    pool.push(m);
  };
  if (data?.hero) add(data.hero);
  if (data?.heroes?.length) data.heroes.forEach(add);
  return pool.filter((m) => m?.imdbId && (m.poster || m.backdrop));
}

function resolveHero(data, pool) {
  const fromApi = data?.hero;
  if (fromApi && !HERO_EXCLUDE(fromApi)) return fromApi;
  return (
    pool.find((m) => m.imdbId === 'tt37287335') ||
    pool.find((m) => m.title === 'Obsession') ||
    pool.find((m) => m.title === 'Stranger Things') ||
    pool.find((m) => m.imdbId === 'tt4574334') ||
    pool[0] ||
    null
  );
}

function resolveHomeBootstrap() {
  const data = getHomeData();
  if (!data?.rows?.length) return { rows: [], hero: null, pool: [] };
  const pool = buildHeroPool(data);
  const list = data.rows;
  const fallbackHero = list.flatMap((r) => r.movies || []).find((m) => m?.imdbId && !HERO_EXCLUDE(m));
  const hero = resolveHero(data, pool) || fallbackHero || null;
  return {
    rows: list,
    hero,
    pool: pool.length ? pool : (hero ? [hero] : []),
  };
}

export default function App() {
  const boot = useMemo(() => resolveHomeBootstrap(), []);
  const [page, setPage] = useState(PAGE.HOME);
  const [navActive, setNavActive] = useState('home');
  const [rows, setRows] = useState(boot.rows);
  const [heroIndex, setHeroIndex] = useState(0);
  const [homeMeta, setHomeMeta] = useState(() => {
    const data = getHomeData();
    return data ? { hero: data.hero, heroes: data.heroes } : null;
  });
  const [modal, setModal] = useState(null);
  const [playerMovie, setPlayerMovie] = useState(null);
  const [playerSeason, setPlayerSeason] = useState(1);
  const [playerEpisode, setPlayerEpisode] = useState(1);
  const [toastMsg, setToastMsg] = useState('');
  const [filteredMovies, setFilteredMovies] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0].id);
  const [myList, setMyList] = useState(() => getMyList());
  const [continueWatching, setContinueWatching] = useState(() => getContinueWatching());
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800);
  }, []);

  const applyHomeData = useCallback((data) => {
    const list = Array.isArray(data?.rows) ? data.rows : [];
    if (!list.length) return;
    persistHomeSnapshot(data);
    setRows(list);
    setHomeMeta({ hero: data.hero, heroes: data.heroes });
  }, []);

  useEffect(() => {
    loadHomeOnce()
      .then((data) => {
        if (data?.rows?.length) applyHomeData(data);
      })
      .catch(() => {});
  }, [applyHomeData]);

  useEffect(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const refreshDaily = () => {
      loadHomeOnce({ fresh: true })
        .then((data) => { if (data?.rows?.length) applyHomeData(data); })
        .catch(() => {});
    };
    const msUntilMidnight = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 5, 0);
      return next - now;
    };
    let dailyTimer = null;
    const midnightTimer = setTimeout(() => {
      refreshDaily();
      dailyTimer = setInterval(refreshDaily, dayMs);
    }, msUntilMidnight());
    return () => {
      clearTimeout(midnightTimer);
      if (dailyTimer) clearInterval(dailyTimer);
    };
  }, [applyHomeData]);

  useEffect(() => {
    const refreshCw = () => setContinueWatching(getContinueWatching());
    window.addEventListener('sf-cw-update', refreshCw);
    return () => window.removeEventListener('sf-cw-update', refreshCw);
  }, []);

  const retryHomeLoad = useCallback(() => {
    resetHomeBootstrap();
    loadHomeOnce().then(applyHomeData).catch(() => showToast('Could not load catalog'));
  }, [applyHomeData, showToast]);

  const handleNavigate = useCallback((id) => {
    setNavActive(id);
    setPage(PAGE.HOME);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (id === 'home' || id === 'games' || id === 'livetv') {
      setFilteredMovies(null);
    } else if (id === 'movies') setFilteredMovies('movie');
    else if (id === 'tv') setFilteredMovies('tv');
    else if (id === 'anime') setFilteredMovies('anime');
    else if (id === 'mylist') {
      setMyList(getMyList());
      setFilteredMovies('mylist');
    } else if (id === 'languages') {
      setFilteredMovies('languages');
    }
  }, []);

  const handleSearchNav = useCallback(() => {
    setPage(PAGE.SEARCH);
    setNavActive('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handlePlay = useCallback((movie, opts = {}) => {
    setModal(null);
    const saved = getSavedResume(movie);
    const isTv = movie?.type === 'tv';
    const s = opts.season ?? saved?.season ?? 1;
    const e = opts.episode ?? saved?.episode ?? 1;
    prefetchStream(movie, isTv ? s : null, isTv ? e : null);
    import('./components/Player');
    setPlayerMovie(movie);
    setPlayerSeason(s);
    setPlayerEpisode(e);
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

  const handleInfo = useCallback((movie) => {
    setModal(movie);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    if (!playerMovie) document.body.style.overflow = '';
  }, [playerMovie]);

  const refreshMyList = useCallback(() => setMyList(getMyList()), []);

  const displayRows = useMemo(() => {
    if (!filteredMovies) return rows;
    if (filteredMovies === 'mylist') {
      if (!myList.length) return [];
      return [{ id: 'mylist', title: 'My List', movies: myList }];
    }
    if (filteredMovies === 'languages') {
      const allMovies = rows.flatMap((r) => r.movies || []);
      const unique = [...new Map(allMovies.map((m) => [m.imdbId, m])).values()];
      const movies = unique.filter((m) => movieMatchesLanguage(m, selectedLanguage));
      if (!movies.length) return [];
      return [{
        id: `lang-${selectedLanguage}`,
        title: `${languageLabel(selectedLanguage)} Movies & TV`,
        movies,
      }];
    }
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
      return [...filtered].sort((a, b) => (a.id === 'latest-tv' || a.id === 'tv' ? -1 : b.id === 'latest-tv' || b.id === 'tv' ? 1 : 0));
    }
    if (filteredMovies === 'movie') {
      return [...filtered].sort((a, b) => (a.id === 'latest-movies' || a.id === 'top-movies' || a.id === 'top10' ? -1 : 0));
    }
    return filtered;
  }, [rows, filteredMovies, myList, selectedLanguage]);

  const heroPool = useMemo(
    () => buildHeroRotationPool(rows, homeMeta),
    [rows, homeMeta],
  );

  useEffect(() => {
    if (page !== PAGE.HOME || filteredMovies || heroPool.length < 2) return undefined;
    const timer = setInterval(() => {
      setHeroIndex((i) => (i + 1) % heroPool.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [page, filteredMovies, heroPool.length]);

  useEffect(() => {
    setHeroIndex(0);
  }, [heroPool.length]);

  const displayHero = useMemo(() => {
    if (!heroPool.length) {
      return rows.flatMap((r) => r.movies || []).find((m) => m?.imdbId && !HERO_EXCLUDE(m)) || null;
    }
    return heroPool[heroIndex % heroPool.length];
  }, [heroPool, heroIndex, rows]);

  const browseContent = (
    <motion.div initial={false} animate={{ opacity: 1, y: 0 }}>
      <Navbar active={navActive} onNavigate={handleNavigate} onSearch={handleSearchNav} />

      <div className="home-static-layer" hidden={page === PAGE.SEARCH} aria-hidden={page === PAGE.SEARCH}>
        <Hero movie={displayHero} onPlay={handlePlay} onInfo={handleInfo} />
        <motion.main className="main-content" initial={false} animate={{ opacity: 1 }}>
          {filteredMovies === 'languages' && (
            <LanguagesBrowse active={selectedLanguage} onChange={setSelectedLanguage} />
          )}
          {continueWatching.length > 0 && !filteredMovies && (
            <MovieRow
              title="Continue Watching"
              variant="continue"
              movies={continueWatching.map((m) => ({
                ...m,
                episodeLabel: m.type === 'tv' ? `S${m.season || 1} E${m.episode || 1}` : null,
              }))}
              onPlay={(m) => handlePlay(m, { season: m.season, episode: m.episode })}
              onInfo={handleInfo}
            />
          )}
          {displayRows.map((row) => (
            <MovieRow
              key={row.id}
              title={row.title}
              movies={row.movies}
              variant={row.variant || 'landscape'}
              exploreLink={row.explore}
              onPlay={handlePlay}
              onInfo={handleInfo}
            />
          ))}
          {filteredMovies === 'mylist' && !myList.length && (
            <p className="browse-empty">Your list is empty. Open a title and tap + to add it.</p>
          )}
          {!displayRows.length && !filteredMovies && !rows.length && (
            <p className="browse-empty">
              Could not load catalog.{' '}
              <button type="button" className="row-explore" onClick={retryHomeLoad}>Retry</button>
            </p>
          )}
          {filteredMovies === 'languages' && !displayRows.length && rows.length > 0 && (
            <p className="browse-empty">No titles found for {languageLabel(selectedLanguage)}.</p>
          )}
        </motion.main>
      </div>

      {page === PAGE.SEARCH && (
        <Suspense fallback={null}>
          <SearchPage onPlay={handlePlay} onInfo={handleInfo} />
        </Suspense>
      )}

      <Footer />
    </motion.div>
  );

  return (
    <>
      <div className={playerMovie ? 'browse-shell browse-shell--under-player' : 'browse-shell'}>
        {browseContent}
      </div>

      <Suspense fallback={null}>
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
              onMyListChange={refreshMyList}
              showToast={showToast}
            />
          )}
        </AnimatePresence>

        {!playerMovie && (
          <ImdbIdWatch onPlay={handlePlay} onInfo={handleInfo} showToast={showToast} />
        )}
      </Suspense>

      <Toast message={toastMsg} />
    </>
  );
}
