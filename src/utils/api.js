// All API calls go through the Express backend (never external APIs from browser)

import { getSearchCache, setSearchCache, POPULAR_SEARCHES } from './searchCache';
import { API_PREFIX } from './config';
import {
  upgradePosterUrl,
  upgradeBackdropUrl,
  isDirectImageUrl,
  isSameImageUrl,
} from './imageUrls';
const CACHE_KEY = 'sf_movie_cache_v6';
export const PLACEHOLDER = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=640&q=80';

let popularPreloadStarted = false;

function getCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function setCacheEntry(key, value) {
  const cache = getCache();
  cache[key] = { data: value, at: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function getCacheEntry(key, maxAge = 1000 * 60 * 60 * 24) {
  const entry = getCache()[key];
  if (!entry) return null;
  if (Date.now() - entry.at > maxAge) return null;
  return entry.data;
}

async function apiFetch(path, options = {}, retries = 2) {
  const timeoutMs = options.timeout ?? 18_000;
  const { timeout, ...fetchOpts } = options;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_PREFIX}${path}`, {
        ...fetchOpts,
        signal: fetchOpts.signal || controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  return null;
}

function buildClientRows(movies) {
  if (!Array.isArray(movies) || !movies.length) {
    return { hero: null, heroes: [], rows: [] };
  }
  const featureFilms = movies.filter((m) => m.type === 'movie' && m.poster);
  const tvShows = movies.filter((m) => m.type === 'tv' && m.poster);
  const recent = movies.filter((m) => m.recent && m.poster);
  const hero = movies.find((m) => m.featured) || movies[0];
  const heroes = (recent.length ? recent : movies).slice(0, 12);
  const rows = [
    { id: 'trending', title: 'Trending Now', movies: featureFilms.slice(0, 20) },
    { id: 'tv', title: 'Popular TV Shows', movies: tvShows.slice(0, 20) },
    { id: 'recent', title: 'Recently Added', movies: (recent.length ? recent : featureFilms).slice(0, 18) },
    {
      id: 'top10',
      title: 'Top 10 Movies Today',
      variant: 'top10',
      movies: [...featureFilms]
        .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
        .slice(0, 10),
    },
  ].filter((r) => r.movies.length);
  return { hero, heroes, rows };
}

export function getPosterApiUrl(movie) {
  const id = movie?.imdbId || movie?.imdbID;
  return id ? `${API_PREFIX}/poster/${id}` : null;
}

function isGenericPlaceholder(url) {
  return !url || url === PLACEHOLDER || String(url).includes('photo-1489599849927');
}

export function getPoster(movie) {
  const local = upgradePosterUrl(movie?.poster || movie?.Poster || movie?.primaryImage?.url);
  if (local && String(local).startsWith('/')) return local;
  if (isDirectImageUrl(local) && !isGenericPlaceholder(local)) return local;
  return getPosterApiUrl(movie) || PLACEHOLDER;
}

export function getBackdrop(movie) {
  const id = movie?.imdbId || movie?.imdbID;
  if (id) return `${API_PREFIX}/backdrop/${id}`;
  const resolved = upgradeBackdropUrl(movie?.backdrop || movie?.Backdrop);
  if (isDirectImageUrl(resolved) && !isGenericPlaceholder(resolved)) return resolved;
  return PLACEHOLDER;
}

export async function fetchHeroImages(imdbId) {
  return apiFetch(`/images/${encodeURIComponent(imdbId)}`);
}

/**
 * Fast search via imdbapi.dev (backend proxy).
 * Supports AbortSignal + instant cache.
 * Returns { results, total }
 */
export async function searchMovies(query, options = {}) {
  const q = query?.trim();
  if (!q) return { results: [], total: 0 };

  const cached = getSearchCache(q);
  if (cached && !options.skipCache) return cached;

  const params = new URLSearchParams({ q });
  params.set('pages', String(options.pages || 10));

  const data = await apiFetch(`/search?${params}`, { signal: options.signal });
  const payload = {
    results: data.results || [],
    total: data.total ?? data.results?.length ?? 0,
  };

  setSearchCache(q, payload);
  return payload;
}

/** Preload popular queries into cache (non-blocking) */
export function preloadPopularSearches() {
  if (popularPreloadStarted) return;
  popularPreloadStarted = true;

  POPULAR_SEARCHES.forEach((q) => {
    if (getSearchCache(q)) return;
    searchMovies(q, { skipCache: false }).catch(() => {});
  });
}

export async function fetchAllMovies() {
  const cached = getCacheEntry('all');
  if (cached) return cached;
  const data = await apiFetch('/movies');
  setCacheEntry('all', data);
  return data;
}

export async function fetchMovie(id) {
  const cacheKey = `movie:${id}`;
  const cached = getCacheEntry(cacheKey);
  if (cached) return cached;
  const data = await apiFetch(`/movie/${encodeURIComponent(id)}`);
  setCacheEntry(cacheKey, data);
  return data;
}

const trailerCache = new Map();

export async function fetchTrailer(id) {
  if (!id) return null;
  const key = String(id);
  const hit = trailerCache.get(key);
  if (hit && Date.now() - hit.at < 1000 * 60 * 60 * 24) return hit.data;
  try {
    const data = await apiFetch(`/trailer/${encodeURIComponent(key)}`, { timeout: 12_000 });
    trailerCache.set(key, { data, at: Date.now() });
    return data;
  } catch {
    trailerCache.set(key, { data: null, at: Date.now() });
    return null;
  }
}

let rowsCache = null;
let rowsCacheAt = 0;
const ROWS_CACHE_MS = 90_000;

export async function fetchRows({ fresh = false } = {}) {
  if (!fresh && rowsCache?.rows?.length && Date.now() - rowsCacheAt < ROWS_CACHE_MS) {
    return rowsCache;
  }
  try {
    const data = await apiFetch('/rows', { timeout: 20_000 });
    if (Array.isArray(data?.rows) && data.rows.length) {
      rowsCache = data;
      rowsCacheAt = Date.now();
      return data;
    }
  } catch {
    /* try catalog fallback */
  }
  if (rowsCache?.rows?.length) return rowsCache;
  try {
    const movies = await fetchAllMovies();
    const fallback = buildClientRows(movies);
    if (fallback.rows.length) {
      rowsCache = fallback;
      rowsCacheAt = Date.now();
      return fallback;
    }
  } catch {
    /* ignore */
  }
  throw new Error('Could not load catalog');
}

/** Fetch episodes — works with tmdbId OR imdbId */
export async function fetchEpisodes(tmdbIdOrImdb, season, options = {}) {
  const { imdbId, tmdbId } = options.imdbId
    ? { imdbId: options.imdbId, tmdbId: options.tmdbId }
    : String(tmdbIdOrImdb).startsWith('tt')
      ? { imdbId: tmdbIdOrImdb, tmdbId: options.tmdbId }
      : { tmdbId: tmdbIdOrImdb, imdbId: options.imdbId };

  const cacheKey = `episodes:${imdbId || tmdbId}:${season}`;
  const cached = getCacheEntry(cacheKey, 1000 * 60 * 60 * 6);
  if (cached?.length) return cached;

  let data;
  if (imdbId) {
    const res = await apiFetch(`/tv/imdb/${imdbId}/season/${season}/episodes`);
    data = Array.isArray(res) ? res : (res.episodes || []);
    if (res.movie) setCacheEntry(`movie:${imdbId}`, res.movie);
  } else if (tmdbId) {
    const res = await apiFetch(`/tv/${tmdbId}/season/${season}/episodes`);
    data = Array.isArray(res) ? res : (res.episodes || []);
  } else {
    return [];
  }

  if (data.length) setCacheEntry(cacheKey, data);
  return data;
}

export async function fetchTvSeasons(id, options = {}) {
  const cacheKey = `seasons:${options.imdbId || id}`;
  const cached = getCacheEntry(cacheKey, 1000 * 60 * 60 * 12);
  if (cached) return cached;

  const lookupId = options.imdbId || id;
  const data = await apiFetch(`/tv/${encodeURIComponent(lookupId)}/seasons`);
  setCacheEntry(cacheKey, data);
  return data;
}

export async function enrichMovie(imdbId) {
  return fetchMovie(imdbId);
}

const imageResolveCache = new Map();

export async function fetchMovieImages(imdbId) {
  if (!imdbId) return null;
  if (imageResolveCache.has(imdbId)) return imageResolveCache.get(imdbId);
  try {
    const data = await apiFetch(`/images/${encodeURIComponent(imdbId)}`);
    imageResolveCache.set(imdbId, data);
    return data;
  } catch {
    return null;
  }
}

export async function fetchStreamProviders(id, season, episode) {
  let path = `/stream/${encodeURIComponent(id)}`;
  const params = new URLSearchParams();
  if (season) params.set('season', season);
  if (episode) params.set('episode', episode);
  if (params.toString()) path += `?${params}`;
  return apiFetch(path);
}

export async function probeStreamUrl(url) {
  try {
    const data = await apiFetch(`/probe?url=${encodeURIComponent(url)}`);
    return data.ok === true;
  } catch {
    return false;
  }
}

export async function probeStreamUrls(urls) {
  const results = await Promise.all(urls.map((url) => probeStreamUrl(url)));
  return results;
}

const PROGRESS_KEY = 'sf_progress_v1';

export function getWatchProgress(id) {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
    return all[id] || null;
  } catch {
    return null;
  }
}

function progressKey(movie) {
  return movie?.imdbId || (movie?.tmdbId != null ? String(movie.tmdbId) : null);
}

export function saveWatchProgress(movie, progress, season, episode) {
  const key = progressKey(movie);
  if (!key) return;
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
    all[key] = {
      movie,
      progress,
      season: season || 1,
      episode: episode || 1,
      updatedAt: Date.now(),
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
    updateContinueWatching(movie, season, episode, progress);
  } catch { /* ignore */ }
}

const CW_KEY = 'sf_continue_v1';

export function getContinueWatching() {
  try {
    return JSON.parse(localStorage.getItem(CW_KEY) || '[]').filter(
      (m) => m.progress >= 5 && m.progress < 96,
    );
  } catch {
    return [];
  }
}

function updateContinueWatching(movie, season, episode, progress) {
  const key = progressKey(movie);
  const pct = progress || 0;
  let list = JSON.parse(localStorage.getItem(CW_KEY) || '[]').filter(
    (x) => (x.imdbId || String(x.tmdbId)) !== key,
  );
  if (pct >= 5 && pct < 96) {
    list.unshift({
      ...movie,
      season: season || 1,
      episode: episode || 1,
      progress: pct,
      updatedAt: Date.now(),
    });
  }
  localStorage.setItem(CW_KEY, JSON.stringify(list.slice(0, 12)));
  window.dispatchEvent(new CustomEvent('sf-cw-update'));
}

export function getSavedResume(movie) {
  const key = progressKey(movie);
  if (!key) return null;
  const entry = getWatchProgress(key);
  if (!entry || entry.progress >= 96) return null;
  return entry;
}
