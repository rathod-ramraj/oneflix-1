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
  PLACEHOLDER,
} from './omdbService.js';
import { searchImdbApi, fetchImdbApiById } from './imdbApiService.js';
import { resolveImages } from './imageService.js';
import { buildStreamProviders, ALLOWED_EMBED_HOSTS } from './streamProviders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';

const moviesPath = path.join(__dirname, 'movies.json');
let movies = [];

function loadMovies() {
  movies = JSON.parse(fs.readFileSync(moviesPath, 'utf-8'));
}

loadMovies();

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

/** Fast search: local + imdbapi.dev (+ OMDb fallback when relevance is low) */
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const maxPages = Math.min(parseInt(req.query.pages, 10) || 10, 15);

  if (!q) return res.json({ results: [], total: 0 });

  try {
    const localHits = searchLocalCatalog(movies, q);

    const [imdbSettled, omdbSettled] = await Promise.allSettled([
      searchImdbApi(q),
      OMDB_API_KEY ? searchOmdbAll(OMDB_API_KEY, q, maxPages) : Promise.resolve([]),
    ]);

    const imdbHits =
      imdbSettled.status === 'fulfilled'
        ? imdbSettled.value.results || []
        : [];
    const omdbHits =
      omdbSettled.status === 'fulfilled' ? omdbSettled.value : [];

    if (imdbSettled.status === 'rejected') {
      console.warn('[search] imdbapi:', imdbSettled.reason?.message);
    }
    if (omdbSettled.status === 'rejected') {
      console.warn('[search] omdb:', omdbSettled.reason?.message);
    }

    const remoteHits = mergeSearchResults([], [...imdbHits, ...omdbHits], q);
    const merged = mergeSearchResults(localHits, remoteHits, q);
    res.json({
      results: merged,
      total: merged.length,
      source: 'all',
      counts: { local: localHits.length, imdbapi: imdbHits.length, omdb: omdbHits.length },
    });
  } catch (err) {
    console.error('[search]', err);
    res.status(500).json({ results: [], total: 0, error: 'Search failed' });
  }
});

/** Legacy array response for older clients */
app.get('/api/movies', (_req, res) => {
  res.json(movies);
});

app.get('/api/movie/:id', async (req, res) => {
  const movie = await resolveMovie(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  res.json(movie);
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
const SPOTLIGHT_TITLES = [
  'Stranger Things',
  'Dhurandhar The Revenge (2026)',
  'From',
  'Game of Thrones',
  'The Dark Knight',
  'Breaking Bad',
  'The Last of Us',
  'Oppenheimer',
  'Interstellar',
  'Wednesday',
  'The Boys',
];

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

function byTitle(titles) {
  return titles.map((t) => movies.find((m) => m.title === t)).filter((m) => hasValidImage(m));
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

function buildHeroPool(seed) {
  const featured =
    movies.find((m) => m.featured && hasValidImage(m) && !isHeroExcluded(m)) ||
    movies.find((m) => m.title === 'Stranger Things');
  const spotlight = byTitle(SPOTLIGHT_TITLES).filter((m) => !isHeroExcluded(m));
  const rest = pickMovies(
    spotlight.filter((m) => m.imdbId !== featured?.imdbId),
    11,
    seed
  );
  const pool = featured ? [featured, ...rest] : spotlight.slice(0, 12);
  return [...new Map(pool.map((m) => [m.imdbId, m])).values()];
}

function genreMovies(genreNeedle, type = 'movie') {
  const needle = genreNeedle.toLowerCase();
  return activeCatalog().filter((m) => m.type === type && (m.genre || '').toLowerCase().includes(needle));
}

app.get('/api/rows', (_req, res) => {
  loadMovies();
  const seed = rotateSeed();
  const catalog = activeCatalog();
  const featureFilms = catalog.filter((m) => m.type === 'movie');
  const tvShows = catalog.filter((m) => m.type === 'tv');
  const indianPool = featureFilms.filter((m) =>
    ['Jawan', 'Pathaan', 'Animal', 'RRR', 'KGF', 'Vikram', 'Leo', 'Pushpa', 'Kantara', 'Dhurandhar'].some((k) =>
      (m.title || '').includes(k)
    )
  );
  const heroPool = buildHeroPool(seed);
  const hero = heroPool[0] || catalog[0] || null;

  const topRated = [...featureFilms].sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));

  const rows = [
    { id: 'top10', title: 'Top 10 Movies Today', variant: 'top10', movies: pickMovies(featureFilms, 10, seed + 10) },
    { id: 'trending', title: 'Trending Now', movies: pickMovies(featureFilms, 10, seed + 20) },
    { id: 'toprated', title: 'Top Rated Movies', movies: pickMovies(topRated, 10, seed + 30) },
    { id: 'indian', title: 'Indian Blockbusters', movies: pickMovies(indianPool.length ? indianPool : featureFilms, 10, seed + 40) },
    { id: 'tv', title: 'Popular TV Shows', movies: pickMovies(tvShows, 12, seed + 50) },
    { id: 'recent', title: 'Recently Added', movies: pickMovies(movies.filter((m) => m.recent).length ? movies.filter((m) => m.recent) : featureFilms, 12, seed + 60) },
    { id: 'drama', title: 'Drama Movies', movies: pickMovies(genreMovies('drama').length ? genreMovies('drama') : featureFilms, 10, seed + 70) },
    { id: 'scifi', title: 'Sci-Fi Movies', variant: 'landscape', explore: true, movies: pickMovies(genreMovies('sci').length ? genreMovies('sci') : featureFilms, 10, seed + 80) },
    { id: 'horror', title: 'Horror Movies', movies: pickMovies(genreMovies('horror').length ? genreMovies('horror') : featureFilms, 10, seed + 90) },
    { id: 'action', title: 'Action & Thrillers', movies: pickMovies(genreMovies('action').length ? genreMovies('action') : featureFilms, 10, seed + 100) },
    { id: 'blockbuster', title: 'Hollywood Blockbusters', movies: pickMovies(featureFilms.filter((m) => !indianPool.includes(m)), 10, seed + 110) },
    { id: 'comedy', title: 'Comedy Movies', movies: pickMovies(genreMovies('comedy').filter((m) => hasValidImage(m)).length ? genreMovies('comedy').filter((m) => hasValidImage(m)) : featureFilms, 10, seed + 120) },
  ];

  res.set('Cache-Control', 'no-store');
  res.json({ hero, heroes: heroPool, rows });
});

const redirectCache = new Map();

async function resolveForId(id) {
  const movie = findLocalMovie(id) || { imdbId: id.startsWith('tt') ? id : null, tmdbId: id };
  return resolveImages(movie, {
    tmdbKey: TMDB_API_KEY,
    omdbKey: OMDB_API_KEY,
    unsplashKey: UNSPLASH_ACCESS_KEY,
  });
}

app.get('/api/poster/:id', async (req, res) => {
  const { id } = req.params;
  const key = `p:${id}`;
  const hit = redirectCache.get(key);
  if (hit && Date.now() - hit.at < 1000 * 60 * 60 * 12) {
    return res.redirect(302, hit.url);
  }
  const enriched = await resolveForId(id);
  const url = enriched.poster || PLACEHOLDER;
  redirectCache.set(key, { url, at: Date.now() });
  res.set('Cache-Control', 'public, max-age=43200');
  res.redirect(302, url);
});

app.get('/api/backdrop/:id', async (req, res) => {
  const { id } = req.params;
  const key = `b:${id}`;
  const hit = redirectCache.get(key);
  if (hit && Date.now() - hit.at < 1000 * 60 * 60 * 12) {
    return res.redirect(302, hit.url);
  }
  const enriched = await resolveForId(id);
  const url = enriched.backdrop || enriched.poster || PLACEHOLDER;
  redirectCache.set(key, { url, at: Date.now() });
  res.set('Cache-Control', 'public, max-age=43200');
  res.redirect(302, url);
});

app.get('/api/images/:imdbId', async (req, res) => {
  const enriched = await resolveForId(req.params.imdbId);
  res.json({
    poster: enriched.poster,
    backdrop: enriched.backdrop,
    tmdbId: enriched.tmdbId,
  });
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
  console.log(`StreamApp API on port ${PORT}`);
  console.log(`CORS: ${FRONTEND_URL || 'localhost + *.vercel.app'}`);
  console.log(`OMDb: ${OMDB_API_KEY ? 'enabled' : 'missing — set OMDB_API_KEY'}`);
  console.log(`TMDB: ${TMDB_API_KEY ? 'enabled' : 'optional'}`);
  console.log(`Unsplash: ${UNSPLASH_ACCESS_KEY ? 'enabled' : 'optional'}`);
  console.log(`Static UI: ${serveStatic ? 'enabled' : 'disabled (API only)'}`);
});
