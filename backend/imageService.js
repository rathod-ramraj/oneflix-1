/**
 * Resolve poster/backdrop via open APIs: TMDB → OMDb → imdbapi.dev
 */
import { findTmdbByImdb, fetchOmdbById, PLACEHOLDER } from './omdbService.js';
import { fetchImdbApiById } from './imdbApiService.js';
import { fetchUnsplashImages } from './unsplashService.js';

const imageCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 6;

function cacheGet(key) {
  const e = imageCache.get(key);
  if (!e || Date.now() - e.at > CACHE_TTL) return null;
  return e.data;
}

function cacheSet(key, data) {
  imageCache.set(key, { data, at: Date.now() });
}

function tmdbPoster(path) {
  return path ? `https://image.tmdb.org/t/p/w500${path}` : null;
}

function tmdbBackdrop(path) {
  return path ? `https://image.tmdb.org/t/p/w1280${path}` : null;
}

async function fetchTmdbDetails(tmdbKey, tmdbId, type = 'movie') {
  if (!tmdbKey || !tmdbId) return null;
  const path = type === 'tv' ? 'tv' : 'movie';
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${path}/${tmdbId}?api_key=${tmdbKey}`);
    const data = await res.json();
    if (data.success === false) return null;
    return {
      tmdbId: data.id,
      type: path === 'tv' ? 'tv' : 'movie',
      poster: tmdbPoster(data.poster_path),
      backdrop: tmdbBackdrop(data.backdrop_path),
    };
  } catch {
    return null;
  }
}

/** Resolve best poster + backdrop for one title */
export async function resolveImages(movie, { tmdbKey = '', omdbKey = '', unsplashKey = '' } = {}) {
  if (!movie) return movie;
  const cacheKey = movie.imdbId || String(movie.tmdbId);
  if (!cacheKey) return movie;

  const cached = cacheGet(cacheKey);
  if (cached?.poster && cached.poster !== PLACEHOLDER) {
    return { ...movie, ...cached };
  }

  let poster = null;
  let backdrop = null;
  let tmdbId = movie.tmdbId || null;
  let type = movie.type || 'movie';

  if (tmdbKey && movie.tmdbId) {
    const detail = await fetchTmdbDetails(tmdbKey, movie.tmdbId, movie.type);
    if (detail?.poster) {
      poster = detail.poster;
      backdrop = detail.backdrop || detail.poster;
      tmdbId = detail.tmdbId;
      type = detail.type;
    }
  }

  if (!poster && tmdbKey && movie.imdbId) {
    const tmdb = await findTmdbByImdb(tmdbKey, movie.imdbId, movie.type === 'tv' ? 'tv' : 'movie');
    if (tmdb?.poster) {
      poster = tmdb.poster;
      backdrop = tmdb.backdrop || tmdb.poster;
      tmdbId = tmdb.tmdbId || tmdbId;
      type = tmdb.type || type;
    } else if (tmdb?.tmdbId) {
      const detail = await fetchTmdbDetails(tmdbKey, tmdb.tmdbId, tmdb.type);
      if (detail?.poster) {
        poster = detail.poster;
        backdrop = detail.backdrop || detail.poster;
        tmdbId = detail.tmdbId;
        type = detail.type;
      }
    }
  }

  if (!poster && omdbKey && movie.imdbId) {
    const omdb = await fetchOmdbById(omdbKey, movie.imdbId);
    if (omdb?.poster && omdb.poster !== 'N/A') {
      poster = omdb.poster;
      backdrop = omdb.backdrop && omdb.backdrop !== 'N/A' ? omdb.backdrop : omdb.poster;
    }
  }

  if (!poster && movie.imdbId) {
    const imdb = await fetchImdbApiById(movie.imdbId);
    if (imdb?.poster && !imdb.poster.includes('unsplash')) {
      poster = imdb.poster;
      backdrop = imdb.backdrop && !imdb.backdrop.includes('unsplash') ? imdb.backdrop : imdb.poster;
    }
  }

  if (!poster && unsplashKey && movie.title) {
    const unsplash = await fetchUnsplashImages(unsplashKey, movie.title, movie.genre);
    if (unsplash?.poster) {
      poster = unsplash.poster;
      backdrop = unsplash.backdrop || unsplash.poster;
    }
  }

  const result = {
    poster: poster || (movie.poster && !String(movie.poster).includes('unsplash.com/photo-1489599849927') ? movie.poster : null) || PLACEHOLDER,
    backdrop: backdrop || movie.backdrop || poster || movie.poster || PLACEHOLDER,
    tmdbId: tmdbId || movie.tmdbId,
    type,
  };

  if (result.poster !== PLACEHOLDER) cacheSet(cacheKey, result);
  return { ...movie, ...result };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Batch-enrich unique movies for home rows */
export async function enrichMoviesImages(movies, opts = {}, concurrency = 8) {
  const unique = [];
  const seen = new Set();
  for (const m of movies) {
    if (!m?.imdbId || seen.has(m.imdbId)) continue;
    seen.add(m.imdbId);
    unique.push(m);
  }
  const enriched = await mapWithConcurrency(unique, concurrency, (m) => resolveImages(m, opts));
  const map = new Map(enriched.map((m) => [m.imdbId, m]));
  return (list) => list.map((m) => (m?.imdbId && map.has(m.imdbId) ? map.get(m.imdbId) : m));
}

export { PLACEHOLDER };
