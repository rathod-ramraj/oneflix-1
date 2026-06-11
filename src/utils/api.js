// All API calls go through the Express backend (never external APIs from browser)

import { getSearchCache, setSearchCache, POPULAR_SEARCHES } from './searchCache';
import { API_PREFIX } from './config';
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

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_PREFIX}${path}`, options);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function getPoster(movie) {
  const id = movie?.imdbId || movie?.imdbID;
  if (id) return `${API_PREFIX}/poster/${id}`;
  const p = movie?.poster || movie?.Poster || movie?.primaryImage?.url;
  if (p && p !== 'N/A') return p;
  return PLACEHOLDER;
}

export function getBackdrop(movie) {
  const id = movie?.imdbId || movie?.imdbID;
  if (id) return `${API_PREFIX}/backdrop/${id}`;
  const b = movie?.backdrop || movie?.poster || movie?.Poster || movie?.primaryImage?.url;
  if (b && b !== 'N/A') return b;
  return PLACEHOLDER;
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

export async function fetchRows() {
  const data = await apiFetch(`/rows?_=${Date.now()}`);
  return data;
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
    return JSON.parse(localStorage.getItem(CW_KEY) || '[]');
  } catch {
    return [];
  }
}

function updateContinueWatching(movie, season, episode, progress) {
  const key = progressKey(movie);
  const list = getContinueWatching().filter(
    (x) => (x.imdbId || String(x.tmdbId)) !== key,
  );
  list.unshift({
    ...movie,
    season: season || 1,
    episode: episode || 1,
    progress: progress || 0,
    updatedAt: Date.now(),
  });
  localStorage.setItem(CW_KEY, JSON.stringify(list.slice(0, 12)));
}
