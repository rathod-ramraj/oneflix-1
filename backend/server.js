import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  searchOmdbAll,
  fetchOmdbById,
  findTmdbByImdb,
  getTmdbTvSeasons,
  fetchTmdbByNumericId,
  enrichMoviesPosters,
  enrichPoster,
  searchLocalCatalog,
  mergeSearchResults,
  searchTmdbAll,
  PLACEHOLDER,
} from './omdbService.js';
import { searchImdbApi, fetchImdbApiById } from './imdbApiService.js';
import { resolveImages, enrichSearchResults, probeImageUrl } from './imageService.js';
import { buildStreamProviders, ALLOWED_EMBED_HOSTS, probeProviderUrl, isAllowedProviderUrl } from './streamProviders.js';
import { isBotRequest, BOT_BLOCK_MESSAGE } from './botGuard.js';
import { fetchYoutubeTrailer } from './youtubeService.js';
import { configureUnsplashKeys } from './unsplashService.js';
import { getDailyCatalog, warmDailyCatalog } from './dailyCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const UNSPLASH_ACCESS_KEY_2 = process.env.UNSPLASH_ACCESS_KEY_2 || '';
const UNSPLASH_APPLICATION_ID = process.env.UNSPLASH_APPLICATION_ID || '';
const UNSPLASH_APPLICATION_ID_2 = process.env.UNSPLASH_APPLICATION_ID_2 || '';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

function loadUnsplashAccessKeys() {
  const fromList = (process.env.UNSPLASH_ACCESS_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const keys = [
    ...fromList,
    UNSPLASH_ACCESS_KEY,
    UNSPLASH_ACCESS_KEY_2,
  ].filter(Boolean);
  return [...new Set(keys)];
}

const UNSPLASH_ACCESS_KEYS = loadUnsplashAccessKeys();
configureUnsplashKeys(
  UNSPLASH_ACCESS_KEYS,
  [UNSPLASH_APPLICATION_ID, UNSPLASH_APPLICATION_ID_2].filter(Boolean),
);

function imageOpts() {
  return {
    tmdbKey: TMDB_API_KEY,
    omdbKey: OMDB_API_KEY,
    unsplashKeys: UNSPLASH_ACCESS_KEYS,
    unsplashKey: UNSPLASH_ACCESS_KEYS[0] || '',
  };
}

async function withImages(movie) {
  if (!movie) return movie;
  return resolveImages(movie, imageOpts());
}

const moviesPath = path.join(__dirname, 'movies.json');
let movies = [];

function loadMovies() {
  movies = JSON.parse(fs.readFileSync(moviesPath, 'utf-8'));
}

loadMovies();
warmDailyCatalog(TMDB_API_KEY);

const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (/^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());

app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path.startsWith('/api/')) return next();
  if (!isBotRequest(req)) return next();
  res.status(403).type('text/plain').send(BOT_BLOCK_MESSAGE);
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'streamapp-api' });
});

const ALLOWED_HOSTS = ALLOWED_EMBED_HOSTS;

function getStreamUrls(movie, season, episode) {
  return buildStreamProviders(movie, season, episode);
}

function findLocalMovie(id) {
  return movies.find(
    (m) =>
      m.imdbId === id ||
      String(m.tmdbId) === String(id) ||
      m.title.toLowerCase() === String(id).toLowerCase()
  );
}

/** Resolve movie from catalog, imdbapi, OMDb, or TMDB */
async function resolveMovie(id) {
  const local = findLocalMovie(id);
  if (local) return local;

  if (id?.startsWith('tt')) {
    const fromImdbApi = await fetchImdbApiById(id);
    if (fromImdbApi) {
      if (TMDB_API_KEY && fromImdbApi.type === 'tv' && !fromImdbApi.tmdbId) {
        const tmdb = await findTmdbByImdb(TMDB_API_KEY, id, 'tv');
        if (tmdb) {
          const tvInfo = await getTmdbTvSeasons(TMDB_API_KEY, tmdb.tmdbId);
          return {
            ...fromImdbApi,
            tmdbId: tmdb.tmdbId,
            seasons: tvInfo?.seasons || fromImdbApi.seasons,
            poster: fromImdbApi.poster || tmdb.poster,
          };
        }
      }
      return fromImdbApi;
    }
  }

  if (id?.startsWith('tt') && OMDB_API_KEY) {
    let movie = await fetchOmdbById(OMDB_API_KEY, id);
    if (!movie) return null;

    const tmdb = await findTmdbByImdb(TMDB_API_KEY, id);
    if (tmdb) {
      movie = { ...movie, tmdbId: tmdb.tmdbId, type: movie.type || tmdb.type };
      if (tmdb.type === 'tv') {
        const tvInfo = await getTmdbTvSeasons(TMDB_API_KEY, tmdb.tmdbId);
        if (tvInfo) movie = { ...movie, seasons: tvInfo.seasons, poster: movie.poster || tvInfo.poster };
      }
      if (!movie.poster || movie.poster === 'N/A') {
        movie = await enrichPoster(TMDB_API_KEY, movie);
      }
    }
    return movie;
  }

  if (/^\d+$/.test(String(id)) && TMDB_API_KEY) {
    return fetchTmdbByNumericId(TMDB_API_KEY, id);
  }

  return null;
}

/** In-memory full-search cache — one external fetch per query, paginated slices after */
const searchFullCache = new Map();

async function fetchFullSearchResults(q, maxPages) {
  const key = `${q.toLowerCase()}:${maxPages}`;
  if (searchFullCache.has(key)) return searchFullCache.get(key);

  const promise = (async () => {
    loadMovies();
    const localHits = searchLocalCatalog(movies, q);

    const [tmdbSettled, imdbSettled, omdbSettled] = await Promise.allSettled([
      TMDB_API_KEY ? searchTmdbAll(TMDB_API_KEY, q, maxPages) : Promise.resolve([]),
      searchImdbApi(q),
      OMDB_API_KEY ? searchOmdbAll(OMDB_API_KEY, q, maxPages) : Promise.resolve([]),
    ]);

    const tmdbHits = tmdbSettled.status === 'fulfilled' ? tmdbSettled.value : [];
    const imdbHits =
      imdbSettled.status === 'fulfilled'
        ? imdbSettled.value.results || []
        : [];
    const omdbHits =
      omdbSettled.status === 'fulfilled' ? omdbSettled.value : [];

    if (tmdbSettled.status === 'rejected') {
      console.warn('[search] tmdb:', tmdbSettled.reason?.message);
    }
    if (imdbSettled.status === 'rejected') {
      console.warn('[search] imdbapi:', imdbSettled.reason?.message);
    }
    if (omdbSettled.status === 'rejected') {
      console.warn('[search] omdb:', omdbSettled.reason?.message);
    }

    const remoteHits = mergeSearchResults(
      mergeSearchResults(tmdbHits, imdbHits, q),
      omdbHits,
      q,
    );
    const merged = mergeSearchResults(localHits, remoteHits, q);
    const enhanced = await enrichSearchResults(merged, { tmdbKey: TMDB_API_KEY }, 36);
    return enhanced;
  })();

  searchFullCache.set(key, promise);
  return promise;
}

/** Fast search: local + TMDB + imdbapi (+ OMDb fallback) — paginated when page/limit set */
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const maxPages = Math.min(parseInt(req.query.pages, 10) || 10, 15);
  const page = Math.max(1, parseInt(req.query.page, 10) || 0);
  const limit = Math.min(48, Math.max(12, parseInt(req.query.limit, 10) || 24));

  if (!q) return res.json({ results: [], total: 0, hasMore: false, page: 1 });

  try {
    const all = await fetchFullSearchResults(q, maxPages);

    if (!page) {
      res.json({
        results: all,
        total: all.length,
        hasMore: false,
        page: 1,
        source: 'all',
      });
      return;
    }

    const start = (page - 1) * limit;
    const slice = all.slice(start, start + limit);
    const hasMore = start + slice.length < all.length;

    res.json({
      results: slice,
      total: all.length,
      page,
      limit,
      hasMore,
      source: 'page',
    });
  } catch (err) {
    console.error('[search]', err);
    res.status(500).json({ results: [], total: 0, hasMore: false, error: 'Search failed' });
  }
});

/** Legacy array response for older clients */
app.get('/api/movies', (_req, res) => {
  res.json(movies);
});

app.get('/api/movie/:id', async (req, res) => {
  const movie = await resolveMovie(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  res.json(await withImages(movie));
});

app.get('/api/stream/:id', async (req, res) => {
  const movie = await resolveMovie(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  const season = req.query.season ? parseInt(req.query.season, 10) : null;
  const episode = req.query.episode ? parseInt(req.query.episode, 10) : null;
  res.json({
    movie,
    providers: getStreamUrls(movie, season, episode),
  });
});

const HERO_EXCLUDE_IDS = new Set(['tt4154796']);
const BAD_IMAGE_MARKERS = ['1M876Kj8', 'dGfq6e6U7R4i', '6rd4x5uHfR7'];

function isHeroExcluded(movie) {
  return !movie || HERO_EXCLUDE_IDS.has(movie.imdbId) || movie.title === 'Avengers: Endgame';
}

function hasValidImage(movie) {
  const poster = movie?.poster || '';
  if (!poster || poster === 'N/A') return false;
  return !BAD_IMAGE_MARKERS.some((m) => poster.includes(m) || (movie.backdrop || '').includes(m));
}

function activeCatalog() {
  return movies.filter((m) => hasValidImage(m));
}

function rotateSeed() {
  return Math.floor(Date.now() / (60 * 1000));
}

function seededShuffle(arr, seed) {
  const list = [...arr];
  let s = seed;
  for (let i = list.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function pickMovies(pool, count, seed) {
  if (!pool.length) return [];
  return seededShuffle(pool, seed).slice(0, Math.min(count, pool.length));
}

function parseYear(movie) {
  const match = String(movie?.year || '').match(/\d{4}/);
  return match ? parseInt(match[0], 10) : 0;
}

function latestHeroCandidates() {
  const cutoff = new Date().getFullYear() - 2;
  return activeCatalog()
    .filter(
      (m) =>
        !isHeroExcluded(m) &&
        m.backdrop &&
        m.backdrop !== 'N/A' &&
        (m.recent || parseYear(m) >= cutoff)
    )
    .sort((a, b) => {
      const yr = parseYear(b) - parseYear(a);
      if (yr !== 0) return yr;
      if (a.recent && !b.recent) return -1;
      if (b.recent && !a.recent) return 1;
      return parseFloat(b.rating || 0) - parseFloat(a.rating || 0);
    });
}

function buildHeroPool(seed) {
  const featured =
    movies.find((m) => m.featured && hasValidImage(m) && !isHeroExcluded(m)) ||
    movies.find((m) => m.imdbId === 'tt37287335');
  const latest = latestHeroCandidates().filter((m) => m.imdbId !== featured?.imdbId);
  const rest = pickMovies(latest, 11, seed);
  const pool = featured ? [featured, ...rest] : pickMovies(latest, 12, seed);
  return [...new Map(pool.map((m) => [m.imdbId, m])).values()];
}

function genreMovies(genreNeedle, type = 'movie') {
  const needle = genreNeedle.toLowerCase();
  return activeCatalog().filter((m) => m.type === type && (m.genre || '').toLowerCase().includes(needle));
}

let rowsPayloadCache = { data: null, at: 0 };
const ROWS_API_CACHE_MS = 5 * 60_000;

function mergeUniqueRows(primary, fallback, limit) {
  const seen = new Set(primary.map((m) => m.imdbId || `tmdb:${m.tmdbId}`));
  const out = [...primary];
  for (const m of fallback) {
    const key = m.imdbId || `tmdb:${m.tmdbId}`;
    if (seen.has(key) || out.length >= limit) continue;
    seen.add(key);
    out.push(m);
  }
  return out.slice(0, limit);
}

async function buildRowsPayload() {
  loadMovies();
  const daily = await getDailyCatalog(TMDB_API_KEY);
  const seed = rotateSeed();
  const catalog = activeCatalog();
  const featureFilms = catalog.filter((m) => m.type === 'movie');
  const tvShows = catalog.filter((m) => m.type === 'tv');
  const indianPool = featureFilms.filter((m) =>
    ['Jawan', 'Pathaan', 'Animal', 'RRR', 'KGF', 'Vikram', 'Leo', 'Pushpa', 'Kantara', 'Dhurandhar'].some((k) =>
      (m.title || '').includes(k)
    )
  );
  const topRatedLocal = [...featureFilms].sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));

  const latestMovies = mergeUniqueRows(daily.latestMovies || [], featureFilms, 14);
  const latestTv = mergeUniqueRows(daily.latestTv || [], tvShows, 14);
  const topMovies = mergeUniqueRows(daily.topRatedMovies || [], topRatedLocal, 12);
  const topTv = mergeUniqueRows(daily.topRatedTv || [], tvShows, 12);

  const dailyHeroes = (daily.heroPool || []).filter((m) => !isHeroExcluded(m) && hasValidImage(m));
  const localHeroPool = buildHeroPool(seed).filter(
    (m) => !dailyHeroes.some((d) => (d.imdbId && d.imdbId === m.imdbId) || (d.tmdbId && d.tmdbId === m.tmdbId)),
  );
  const heroPool = [...dailyHeroes, ...localHeroPool].slice(0, 18);
  const hero = heroPool[0] || catalog[0] || null;

  const rows = [
    { id: 'latest-movies', title: 'Latest Movies', movies: latestMovies },
    { id: 'latest-tv', title: 'Latest Series', movies: latestTv },
    { id: 'top-movies', title: 'Top Rated Movies', variant: 'top10', movies: topMovies.slice(0, 10) },
    { id: 'top-tv', title: 'Top Rated Series', movies: topTv },
    { id: 'trending', title: 'Trending Now', movies: pickMovies(latestMovies.length ? latestMovies : featureFilms, 12, seed + 20) },
    { id: 'indian', title: 'Indian Blockbusters', movies: pickMovies(indianPool.length ? indianPool : featureFilms, 10, seed + 40) },
    { id: 'recent', title: 'Recently Added', movies: pickMovies(movies.filter((m) => m.recent).length ? movies.filter((m) => m.recent) : featureFilms, 10, seed + 60) },
    { id: 'action', title: 'Action & Thrillers', movies: pickMovies(genreMovies('action').length ? genreMovies('action') : featureFilms, 10, seed + 100) },
    { id: 'binge', title: 'Binge-Worthy Series', movies: pickMovies(latestTv.length ? latestTv : tvShows, 12, seed + 180) },
  ].filter((r) => r.movies?.length);

  return {
    hero,
    heroes: heroPool,
    rows,
    dailyUpdated: daily.date || null,
  };
}

try {
  buildRowsPayload().then((data) => {
    rowsPayloadCache = { data, at: Date.now() };
  }).catch((err) => {
    console.warn('[rows] startup warm cache failed:', err?.message);
  });
} catch (err) {
  console.warn('[rows] startup warm cache failed:', err?.message);
}

app.get('/api/rows', async (_req, res) => {
  try {
    const now = Date.now();
    if (rowsPayloadCache.data && now - rowsPayloadCache.at < ROWS_API_CACHE_MS) {
      res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
      return res.json(rowsPayloadCache.data);
    }

    const payload = await buildRowsPayload();
    rowsPayloadCache = { data: payload, at: now };
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.json(payload);
  } catch (err) {
    console.error('/api/rows failed:', err);
    if (rowsPayloadCache.data) {
      return res.json(rowsPayloadCache.data);
    }
    loadMovies();
    const fallback = movies.filter((m) => m.poster).slice(0, 40);
    res.json({
      hero: fallback[0] || null,
      heroes: fallback.slice(0, 12),
      rows: [{ id: 'browse', title: 'Browse', movies: fallback }],
    });
  }
});

const redirectCache = new Map();

async function pickRedirectUrl(primary, fallbacks = []) {
  const tryOne = async (url) =>
    url && url !== PLACEHOLDER && (await probeImageUrl(url)) ? url : null;
  const hit = await tryOne(primary);
  if (hit) return hit;
  for (const url of fallbacks) {
    const ok = await tryOne(url);
    if (ok) return ok;
  }
  return PLACEHOLDER;
}

async function resolveForId(id, { skipUnsplash = false, skipCatalog = true, type = 'movie' } = {}) {
  let movie = findLocalMovie(id);
  if (!movie) {
    const sid = String(id);
    if (sid.startsWith('tt')) movie = { imdbId: sid };
    else if (/^\d+$/.test(sid)) movie = { tmdbId: Number(sid), type };
    else movie = { imdbId: sid };
  } else if (skipCatalog) {
    movie = { ...movie, poster: undefined, backdrop: undefined };
  }
  return resolveImages(movie, { ...imageOpts(), skipUnsplash, skipCatalog });
}

app.get('/api/poster/:id', async (req, res) => {
  const { id } = req.params;
  const key = `p:${id}`;
  const hit = redirectCache.get(key);
  if (hit && Date.now() - hit.at < 1000 * 60 * 60 * 12 && await probeImageUrl(hit.url)) {
    return res.redirect(302, hit.url);
  }
  if (hit) redirectCache.delete(key);
  const enriched = await resolveForId(id, { skipUnsplash: true, skipCatalog: true });
  const url = await pickRedirectUrl(enriched.poster);
  if (url !== PLACEHOLDER) redirectCache.set(key, { url, at: Date.now() });
  res.set('Cache-Control', 'public, max-age=43200');
  res.redirect(302, url);
});

app.get('/api/poster/tmdb/:tmdbId', async (req, res) => {
  const tmdbId = req.params.tmdbId;
  const type = req.query.type === 'tv' ? 'tv' : 'movie';
  const key = `pt:${type}:${tmdbId}`;
  const hit = redirectCache.get(key);
  if (hit && Date.now() - hit.at < 1000 * 60 * 60 * 12 && await probeImageUrl(hit.url)) {
    return res.redirect(302, hit.url);
  }
  if (hit) redirectCache.delete(key);
  const enriched = await resolveImages(
    { tmdbId: Number(tmdbId), type },
    { ...imageOpts(), skipUnsplash: true, skipCatalog: true },
  );
  const url = await pickRedirectUrl(enriched.poster);
  if (url !== PLACEHOLDER) redirectCache.set(key, { url, at: Date.now() });
  res.set('Cache-Control', 'public, max-age=43200');
  res.redirect(302, url);
});

app.get('/api/backdrop/:id', async (req, res) => {
  const { id } = req.params;
  const key = `b:${id}`;
  const hit = redirectCache.get(key);
  if (hit && Date.now() - hit.at < 1000 * 60 * 60 * 12 && await probeImageUrl(hit.url)) {
    return res.redirect(302, hit.url);
  }
  if (hit) redirectCache.delete(key);
  const enriched = await resolveForId(id, { skipUnsplash: true, skipCatalog: true });
  const url = await pickRedirectUrl(enriched.backdrop, [enriched.poster]);
  if (url !== PLACEHOLDER) redirectCache.set(key, { url, at: Date.now() });
  res.set('Cache-Control', 'public, max-age=43200');
  res.redirect(302, url);
});

app.get('/api/backdrop/tmdb/:tmdbId', async (req, res) => {
  const tmdbId = req.params.tmdbId;
  const type = req.query.type === 'tv' ? 'tv' : 'movie';
  const key = `bt:${type}:${tmdbId}`;
  const hit = redirectCache.get(key);
  if (hit && Date.now() - hit.at < 1000 * 60 * 60 * 12 && await probeImageUrl(hit.url)) {
    return res.redirect(302, hit.url);
  }
  if (hit) redirectCache.delete(key);
  const enriched = await resolveImages(
    { tmdbId: Number(tmdbId), type },
    { ...imageOpts(), skipUnsplash: true, skipCatalog: true },
  );
  const url = await pickRedirectUrl(enriched.backdrop, [enriched.poster]);
  if (url !== PLACEHOLDER) redirectCache.set(key, { url, at: Date.now() });
  res.set('Cache-Control', 'public, max-age=43200');
  res.redirect(302, url);
});

app.get('/api/images/:imdbId', async (req, res) => {
  const enriched = await resolveForId(req.params.imdbId, { skipUnsplash: true });
  res.json({
    poster: enriched.poster,
    backdrop: enriched.backdrop,
    tmdbId: enriched.tmdbId,
  });
});

app.get('/api/trailer/:id', async (req, res) => {
  if (!YOUTUBE_API_KEY) {
    return res.status(503).json({ error: 'YouTube API not configured' });
  }
  const movie = await resolveMovie(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Title not found' });
  const trailer = await fetchYoutubeTrailer(YOUTUBE_API_KEY, movie);
  if (!trailer) return res.status(404).json({ error: 'Trailer not found' });
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(trailer);
});

function estimateEpisodeCount(fallbackMovie, seasonNum, seasonMeta) {
  if (seasonMeta?.episodeCount) return seasonMeta.episodeCount;
  if (fallbackMovie?.episodes && fallbackMovie?.seasons) {
    return Math.max(1, Math.ceil(fallbackMovie.episodes / fallbackMovie.seasons));
  }
  return fallbackMovie?.episodesPerSeason || 10;
}

async function fetchSeasonEpisodes(tmdbId, seasonNum, fallbackMovie, seasonMeta) {
  const defaultCount = estimateEpisodeCount(fallbackMovie, seasonNum, seasonMeta);

  const fallback = (count = defaultCount) =>
    Array.from({ length: count }, (_, i) => ({
      episode: i + 1,
      name: `S${seasonNum}E${i + 1}`,
      overview: fallbackMovie?.plot || `Season ${seasonNum}, episode ${i + 1}`,
      runtime: 45,
      still: fallbackMovie?.poster || PLACEHOLDER,
    }));

  if (!TMDB_API_KEY || !tmdbId) return fallback(defaultCount);

  try {
    const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.success === false || !data.episodes?.length) {
      return fallback(data.episodes?.length || 8);
    }

    return data.episodes.map((ep) => ({
      episode: ep.episode_number,
      name: ep.name || `Episode ${ep.episode_number}`,
      overview: ep.overview || '',
      runtime: ep.runtime || 45,
      still: ep.still_path
        ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
        : fallbackMovie?.poster || PLACEHOLDER,
    }));
  } catch {
    return fallback(8);
  }
}

async function getSeasonMeta(tmdbId, seasonNum, movie) {
  if (!TMDB_API_KEY || !tmdbId) {
    return { episodeCount: estimateEpisodeCount(movie, seasonNum, null) };
  }
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const data = await res.json();
    const match = (data.seasons || []).find((s) => s.season_number === seasonNum);
    if (match?.episode_count) return { episodeCount: match.episode_count, name: match.name };
  } catch { /* use estimate */ }
  return { episodeCount: estimateEpisodeCount(movie, seasonNum, null) };
}

/** TV episodes by IMDb id — MUST be registered before /:tmdbId route */
app.get('/api/tv/imdb/:imdbId/season/:season/episodes', async (req, res) => {
  const { imdbId, season } = req.params;
  const seasonNum = parseInt(season, 10) || 1;

  let movie = await resolveMovie(imdbId);
  let tmdbId = movie?.tmdbId;

  if (!tmdbId && TMDB_API_KEY) {
    const tmdb = await findTmdbByImdb(TMDB_API_KEY, imdbId, 'tv');
    tmdbId = tmdb?.tmdbId;
    if (tmdb) {
      movie = movie
        ? { ...movie, tmdbId, type: tmdb.type === 'tv' ? 'tv' : movie.type }
        : {
            imdbId,
            tmdbId,
            type: tmdb.type || 'tv',
            title: 'TV Show',
            poster: tmdb.poster || PLACEHOLDER,
          };
      if (tmdb.type === 'tv' || movie.type === 'tv') {
        const tvInfo = await getTmdbTvSeasons(TMDB_API_KEY, tmdbId);
        if (tvInfo) movie = { ...movie, seasons: tvInfo.seasons, poster: movie.poster || tvInfo.poster };
      }
    }
  }

  const seasonMeta = await getSeasonMeta(tmdbId, seasonNum, movie);
  const episodes = await fetchSeasonEpisodes(tmdbId, seasonNum, movie, seasonMeta);
  if (!episodes.length) {
    return res.json({
      episodes: Array.from({ length: seasonMeta.episodeCount || 10 }, (_, i) => ({
        episode: i + 1,
        name: `S${seasonNum}E${i + 1}`,
        overview: '',
        runtime: 45,
        still: movie?.poster || PLACEHOLDER,
      })),
      movie,
      season: seasonNum,
    });
  }
  res.json({ episodes, movie, season: seasonNum });
});

/** TV episodes by TMDB numeric id */
app.get('/api/tv/:tmdbId/season/:season/episodes', async (req, res) => {
  const { tmdbId, season } = req.params;
  if (tmdbId === 'imdb') return res.status(404).json({ error: 'Use /api/tv/imdb/:imdbId/...' });
  const seasonNum = parseInt(season, 10) || 1;
  const movie = movies.find((m) => String(m.tmdbId) === String(tmdbId));
  const seasonMeta = await getSeasonMeta(tmdbId, seasonNum, movie);
  const episodes = await fetchSeasonEpisodes(tmdbId, seasonNum, movie, seasonMeta);
  res.json(episodes);
});

/** TV season list with episode counts */
app.get('/api/tv/:id/seasons', async (req, res) => {
  const id = req.params.id;
  let tmdbId = null;
  let movie = findLocalMovie(id) || (await resolveMovie(id));

  if (movie?.tmdbId) tmdbId = movie.tmdbId;
  else if (id.startsWith('tt') && TMDB_API_KEY) {
    const tmdb = await findTmdbByImdb(TMDB_API_KEY, id);
    tmdbId = tmdb?.tmdbId;
  } else if (!id.startsWith('tt')) {
    tmdbId = id;
  }

  if (!tmdbId || !TMDB_API_KEY) {
    const count = movie?.seasons || 1;
    return res.json({
      seasons: Array.from({ length: count }, (_, i) => ({
        season: i + 1,
        episodeCount: 10,
      })),
    });
  }

  try {
    const res2 = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const data = await res2.json();
    const seasons = (data.seasons || [])
      .filter((s) => s.season_number > 0)
      .map((s) => ({
        season: s.season_number,
        episodeCount: s.episode_count,
        name: s.name,
      }));
    res.json({ seasons, tmdbId });
  } catch {
    res.json({ seasons: [{ season: 1, episodeCount: 10 }], tmdbId });
  }
});

app.get('/api/enrich/:imdbId', async (req, res) => {
  const movie = await resolveMovie(req.params.imdbId);
  if (!movie) return res.status(404).json({ error: 'Not found' });
  res.json(movie);
});

app.get('/api/probe', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'Missing url' });
  if (!isAllowedProviderUrl(target)) return res.status(403).json({ error: 'Provider not allowed' });
  const result = await probeProviderUrl(target);
  res.json(result);
});

app.get('/api/embed', (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url');
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).send('Invalid url');
  }
  if (!ALLOWED_HOSTS.some((h) => parsed.hostname.endsWith(h))) {
    return res.status(403).send('Provider not allowed');
  }
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0}html,body,iframe{width:100%;height:100%;border:0;background:#000}</style>
</head><body>
<iframe src="${target.replace(/"/g, '&quot;')}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
</body></html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

/** Optional: serve Vite build from same host (single-server deploy). Off when using Vercel + Render. */
const distPath = path.join(__dirname, '..', 'dist');
const serveStatic = process.env.SERVE_STATIC === 'true' && fs.existsSync(distPath);
if (serveStatic) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  const apiUrl = `http://localhost:${PORT}`;
  console.log(`StreamApp API: ${apiUrl}`);
  console.log(`Health check: ${apiUrl}/api/health`);
  console.log(`CORS: ${FRONTEND_URL || 'localhost + *.vercel.app'}`);
  console.log(`OMDb: ${OMDB_API_KEY ? 'enabled' : 'missing — set OMDB_API_KEY'}`);
  console.log(`TMDB: ${TMDB_API_KEY ? 'enabled' : 'optional'}`);
  console.log(`Unsplash: ${UNSPLASH_ACCESS_KEYS.length ? `enabled (${UNSPLASH_ACCESS_KEYS.length} keys)` : 'optional'}`);
  console.log(`YouTube: ${YOUTUBE_API_KEY ? 'enabled' : 'optional — set YOUTUBE_API_KEY for trailers'}`);
  console.log(`Static UI: ${serveStatic ? 'enabled' : 'disabled (API only)'}`);
});
