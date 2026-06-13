/**
 * Resolve poster/backdrop — catalog first, rotate TMDB/IMDb/OMDb, Unsplash last
 */
import { findTmdbByImdb, fetchOmdbById, PLACEHOLDER } from './omdbService.js';
import { fetchImdbApiById, fetchImdbApiBestBackdrop, fetchImdbApiBestPoster } from './imdbApiService.js';
import { fetchUnsplashImages } from './unsplashService.js';
import {
  upgradePosterUrl,
  upgradeBackdropUrl,
  isSameImageUrl,
  isDirectImageUrl,
  upgradeTmdbUrl,
} from './imageUrls.js';

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
  return path ? `https://image.tmdb.org/t/p/w780${path}` : null;
}

function tmdbBackdrop(path) {
  return path ? `https://image.tmdb.org/t/p/original${path}` : null;
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

async function fetchTmdbBestPoster(tmdbKey, tmdbId, type = 'movie') {
  if (!tmdbKey || !tmdbId) return null;
  const path = type === 'tv' ? 'tv' : 'movie';
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${path}/${tmdbId}/images?api_key=${tmdbKey}`);
    const data = await res.json();
    const posters = (data.posters || [])
      .filter((p) => p.file_path)
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    if (posters.length) return tmdbPoster(posters[0].file_path);
    const detail = await fetchTmdbDetails(tmdbKey, tmdbId, type);
    return detail?.poster || null;
  } catch {
    return null;
  }
}

async function probeImageUrl(url) {
  if (!url || !isDirectImageUrl(url)) return false;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

async function fetchTmdbBestBackdrop(tmdbKey, tmdbId, type = 'movie') {
  if (!tmdbKey || !tmdbId) return null;
  const path = type === 'tv' ? 'tv' : 'movie';
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${path}/${tmdbId}/images?api_key=${tmdbKey}`);
    const data = await res.json();
    const backdrops = (data.backdrops || [])
      .filter((b) => b.file_path)
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    if (!backdrops.length) return null;
    return tmdbBackdrop(backdrops[0].file_path);
  } catch {
    return null;
  }
}

function catalogPoster(movie) {
  const url = upgradePosterUrl(movie?.poster);
  return isDirectImageUrl(url) ? url : null;
}

function catalogBackdrop(movie, poster) {
  const url = upgradeBackdropUrl(movie?.backdrop);
  if (!isDirectImageUrl(url)) return null;
  if (isSameImageUrl(url, poster)) return null;
  return url;
}

function isPlaceholderImage(url) {
  if (!url) return true;
  const u = String(url);
  return u === PLACEHOLDER || u.includes('photo-1489599849927');
}

/** TMDB-only poster fill for search — skips slow Unsplash */
export async function enrichSearchImages(movie, { tmdbKey }) {
  if (!movie) return movie;
  const hasPoster = movie.poster && !isPlaceholderImage(movie.poster);
  if (hasPoster && movie.backdrop && !isPlaceholderImage(movie.backdrop)) return movie;
  if (!tmdbKey) return movie;

  let tmdb = null;
  if (movie.tmdbId) {
    tmdb = await fetchTmdbDetails(tmdbKey, movie.tmdbId, movie.type);
  } else if (movie.imdbId) {
    tmdb = await findTmdbByImdb(tmdbKey, movie.imdbId, movie.type === 'tv' ? 'tv' : 'movie');
    if (tmdb?.tmdbId && (!tmdb.poster || !tmdb.backdrop)) {
      const detail = await fetchTmdbDetails(tmdbKey, tmdb.tmdbId, tmdb.type);
      if (detail) tmdb = { ...tmdb, ...detail };
    }
  }
  if (!tmdb) return movie;

  return {
    ...movie,
    tmdbId: tmdb.tmdbId || movie.tmdbId,
    type: tmdb.type || movie.type,
    poster: hasPoster ? movie.poster : (tmdb.poster || movie.poster),
    backdrop: (!movie.backdrop || isPlaceholderImage(movie.backdrop))
      ? (tmdb.backdrop || movie.backdrop)
      : movie.backdrop,
  };
}

export async function enrichSearchResults(results, opts = {}, limit = 32) {
  if (!opts.tmdbKey || !results.length) return results;
  const head = results.slice(0, limit);
  const tail = results.slice(limit);
  const enriched = await mapWithConcurrency(head, 10, (m) => enrichSearchImages(m, opts));
  return [...enriched, ...tail];
}

const PROVIDER_CHAINS = [
  ['imdb', 'tmdb', 'omdb'],
  ['tmdb', 'imdb', 'omdb'],
  ['imdb', 'omdb', 'tmdb'],
  ['omdb', 'imdb', 'tmdb'],
];

function pickProviderChain(movie) {
  const key = movie?.imdbId || movie?.title || 'x';
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PROVIDER_CHAINS[h % PROVIDER_CHAINS.length];
}

function needsPoster(poster) {
  return !poster || isPlaceholderImage(poster);
}

async function fillFromImdbPoster(movie) {
  if (!movie.imdbId) return null;
  const imdbPoster = await fetchImdbApiBestPoster(movie.imdbId);
  if (imdbPoster) return upgradePosterUrl(imdbPoster) || imdbPoster;
  const imdb = await fetchImdbApiById(movie.imdbId);
  if (imdb?.poster && !imdb.poster.includes('unsplash')) {
    return upgradePosterUrl(imdb.poster) || imdb.poster;
  }
  return null;
}

async function fillFromTmdbPoster(movie, tmdbKey, state) {
  if (!tmdbKey) return null;
  let { tmdbId, type } = state;
  if (movie.tmdbId) {
    const detail = await fetchTmdbDetails(tmdbKey, movie.tmdbId, movie.type);
    if (detail?.poster) {
      state.tmdbId = detail.tmdbId;
      state.type = detail.type;
      if (detail.backdrop && !isSameImageUrl(detail.backdrop, detail.poster)) {
        state.backdropHint = detail.backdrop;
      }
      return detail.poster;
    }
    const best = await fetchTmdbBestPoster(tmdbKey, movie.tmdbId, movie.type);
    if (best) return best;
  }
  if (movie.imdbId) {
    const tmdb = await findTmdbByImdb(tmdbKey, movie.imdbId, movie.type === 'tv' ? 'tv' : 'movie');
    if (tmdb?.poster) {
      state.tmdbId = tmdb.tmdbId || state.tmdbId;
      state.type = tmdb.type || state.type;
      if (tmdb.backdrop && !isSameImageUrl(tmdb.backdrop, tmdb.poster)) {
        state.backdropHint = tmdb.backdrop;
      }
      return upgradePosterUrl(tmdb.poster) || tmdb.poster;
    }
    if (tmdb?.tmdbId) {
      const detail = await fetchTmdbDetails(tmdbKey, tmdb.tmdbId, tmdb.type);
      if (detail?.poster) {
        state.tmdbId = detail.tmdbId;
        state.type = detail.type;
        if (detail.backdrop && !isSameImageUrl(detail.backdrop, detail.poster)) {
          state.backdropHint = detail.backdrop;
        }
        return detail.poster;
      }
    }
  }
  return null;
}

async function fillFromOmdbPoster(movie, omdbKey) {
  if (!omdbKey || !movie.imdbId) return null;
  const omdb = await fetchOmdbById(omdbKey, movie.imdbId);
  if (omdb?.poster && omdb.poster !== 'N/A') {
    return upgradePosterUrl(omdb.poster) || omdb.poster;
  }
  return null;
}

async function fillFromTmdbBackdrop(movie, tmdbKey, state, poster) {
  if (!tmdbKey) return null;
  const tmdbId = state.tmdbId || movie.tmdbId;
  const type = state.type || movie.type || 'movie';
  if (state.backdropHint && !isSameImageUrl(state.backdropHint, poster)) {
    return state.backdropHint;
  }
  if (!tmdbId) return null;
  const fromImages = await fetchTmdbBestBackdrop(tmdbKey, tmdbId, type);
  if (fromImages && !isSameImageUrl(fromImages, poster)) return fromImages;
  const detail = await fetchTmdbDetails(tmdbKey, tmdbId, type);
  if (detail?.backdrop && !isSameImageUrl(detail.backdrop, poster)) return detail.backdrop;
  return null;
}

async function fillFromImdbBackdrop(movie) {
  if (!movie.imdbId) return null;
  const imdbBg = await fetchImdbApiBestBackdrop(movie.imdbId);
  return upgradeBackdropUrl(imdbBg) || imdbBg || null;
}

async function resolveFallbackImages(movie, { tmdbKey, omdbKey }) {
  const state = {
    tmdbId: movie.tmdbId || null,
    type: movie.type || 'movie',
    backdropHint: null,
  };
  let poster = null;
  let backdrop = null;

  const catPoster = catalogPoster(movie);
  if (catPoster && !isPlaceholderImage(catPoster) && await probeImageUrl(catPoster)) {
    poster = catPoster;
  }
  const catBg = catalogBackdrop(movie, poster);
  if (catBg && await probeImageUrl(catBg)) backdrop = catBg;

  for (const provider of pickProviderChain(movie)) {
    if (needsPoster(poster)) {
      if (provider === 'imdb') {
        const p = await fillFromImdbPoster(movie);
        if (p) poster = p;
      } else if (provider === 'tmdb') {
        const p = await fillFromTmdbPoster(movie, tmdbKey, state);
        if (p) poster = p;
      } else if (provider === 'omdb') {
        const p = await fillFromOmdbPoster(movie, omdbKey);
        if (p) poster = p;
      }
    }
    if (!backdrop) {
      if (provider === 'tmdb') {
        const b = await fillFromTmdbBackdrop(movie, tmdbKey, state, poster);
        if (b) backdrop = b;
      } else if (provider === 'imdb') {
        const b = await fillFromImdbBackdrop(movie);
        if (b && !isSameImageUrl(b, poster)) backdrop = b;
      }
    }
    if (poster && !needsPoster(poster) && backdrop) break;
  }

  if (!backdrop) {
    const b = await fillFromTmdbBackdrop(movie, tmdbKey, state, poster)
      || await fillFromImdbBackdrop(movie);
    if (b && !isSameImageUrl(b, poster)) backdrop = b;
  }

  poster = isPlaceholderImage(poster) ? PLACEHOLDER : (poster || PLACEHOLDER);
  backdrop = upgradeBackdropUrl(backdrop) || backdrop || poster;

  if (backdrop && backdrop !== PLACEHOLDER && !(await probeImageUrl(backdrop))) {
    let fixed = null;
    const imdbBg = await fillFromImdbBackdrop(movie);
    const upgraded = upgradeBackdropUrl(imdbBg) || imdbBg;
    if (upgraded && await probeImageUrl(upgraded)) fixed = upgraded;
    if (!fixed && poster && poster !== PLACEHOLDER && await probeImageUrl(poster)) {
      fixed = poster;
    }
    backdrop = fixed || PLACEHOLDER;
  }

  return {
    poster: upgradePosterUrl(poster) || poster,
    backdrop,
    tmdbId: state.tmdbId || movie.tmdbId,
    type: state.type,
  };
}

/** Resolve best poster + backdrop for one title */
export async function resolveImages(movie, { tmdbKey = '', omdbKey = '', unsplashKey = '', unsplashKeys = null, skipUnsplash = false } = {}) {
  if (!movie) return movie;
  const cacheKey = movie.imdbId || String(movie.tmdbId) || movie.title;
  if (!cacheKey) return movie;

  const cached = cacheGet(cacheKey);
  if (cached?.poster && cached.poster !== PLACEHOLDER) {
    if (!skipUnsplash || cached.posterVerified) {
      return { ...movie, ...cached };
    }
  }

  const fallback = await resolveFallbackImages(movie, { tmdbKey, omdbKey });
  let poster = fallback.poster;
  let backdrop = fallback.backdrop;

  const missingPoster = needsPoster(poster);
  const missingBackdrop = !backdrop || backdrop === PLACEHOLDER || isPlaceholderImage(backdrop);
  const unsplashPool = unsplashKeys?.length ? unsplashKeys : (unsplashKey ? [unsplashKey] : []);
  if (!skipUnsplash && unsplashPool.length && movie.title && (missingPoster || missingBackdrop)) {
    try {
      const unsplash = await fetchUnsplashImages(
        unsplashPool,
        movie.title,
        movie.genre,
        movie.type,
      );
      if (unsplash?.poster && missingPoster) poster = unsplash.poster;
      if (unsplash?.backdrop && missingBackdrop) backdrop = unsplash.backdrop;
      else if (unsplash?.poster && missingBackdrop) backdrop = unsplash.poster;
    } catch {
      /* keep catalog/TMDB/IMDb result */
    }
  }

  const posterOk = poster && poster !== PLACEHOLDER
    && (skipUnsplash ? await probeImageUrl(poster) : true);
  const result = {
    ...fallback,
    poster: posterOk ? poster : PLACEHOLDER,
    backdrop: backdrop || poster || PLACEHOLDER,
    posterVerified: posterOk,
  };
  if (posterOk) cacheSet(cacheKey, result);
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

export async function enrichMoviesImages(movies, opts = {}, concurrency = 4) {
  const unique = [];
  const seen = new Set();
  for (const m of movies) {
    const key = m?.imdbId || m?.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(m);
  }
  const enriched = await mapWithConcurrency(unique, concurrency, (m) => resolveImages(m, opts));
  const map = new Map(enriched.map((m) => [m.imdbId || m.title, m]));
  return (list) => list.map((m) => {
    const key = m?.imdbId || m?.title;
    return key && map.has(key) ? map.get(key) : m;
  });
}

export { PLACEHOLDER, upgradePosterUrl, upgradeBackdropUrl, upgradeTmdbUrl, probeImageUrl, mapWithConcurrency };
