// All API calls go through the Express backend (never external APIs from browser)

import { getSearchCache, setSearchCache, POPULAR_SEARCHES } from './searchCache';
import { API_PREFIX } from './config';
import {
  upgradePosterUrl,
  upgradeBackdropUrl,
  isDirectImageUrl,
  isSameImageUrl,
} from './imageUrls';
import { buildClientRows } from './catalogRows';
import { getOfflineHome } from './offlineHome';
import { getMovieFromCatalog } from './movieCatalog';
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

const posterFailCache = new Set();
const backdropFailCache = new Set();

export function getPosterApiUrl(movie) {
  const id = movie?.imdbId || movie?.imdbID;
  if (!id || posterFailCache.has(id)) return null;
  return `${API_PREFIX}/poster/${id}`;
}

export function getBackdropApiUrl(movie) {
  const id = movie?.imdbId || movie?.imdbID;
  if (!id || backdropFailCache.has(id)) return null;
  return `${API_PREFIX}/backdrop/${id}`;
}

export function markPosterFailed(id) {
  if (id) posterFailCache.add(String(id));
}

export function markBackdropFailed(id) {
  if (id) backdropFailCache.add(String(id));
}

function isGenericPlaceholder(url) {
  return !url || url === PLACEHOLDER || String(url).includes('photo-1489599849927');
}

export function getPoster(movie) {
  const local = upgradePosterUrl(movie?.poster || movie?.Poster || movie?.primaryImage?.url);
  if (local && String(local).startsWith('/')) return local;
  if (isDirectImageUrl(local) && !isGenericPlaceholder(local)) return local;
  return PLACEHOLDER;
}

export function getBackdrop(movie) {
  const resolved = upgradeBackdropUrl(movie?.backdrop || movie?.Backdrop);
  if (isDirectImageUrl(resolved) && !isGenericPlaceholder(resolved)) return resolved;
  const poster = upgradePosterUrl(movie?.poster || movie?.Poster || movie?.primaryImage?.url);
  if (isDirectImageUrl(poster) && !isGenericPlaceholder(poster)) return poster;
  return PLACEHOLDER;
}

export async function fetchHeroImages(imdbId) {
  return apiFetch(`/images/${encodeURIComponent(imdbId)}`);
}

/**
 * Paginated search — one page per request until hasMore=false.
 * Full result set is cached on the server after the first page.
 */
export async function searchMoviesPage(query, page = 1, options = {}) {
  const q = query?.trim();
  if (!q) return { results: [], total: 0, hasMore: false, page: 1 };

  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const params = new URLSearchParams({ q, page: String(page), limit: String(options.limit || 24) });
  if (options.pages) params.set('pages', String(options.pages));

  const data = await apiFetch(`/search?${params}`, { signal: options.signal });
  return {
    results: data.results || [],
    total: data.total ?? 0,
    hasMore: Boolean(data.hasMore),
    page: data.page || page,
  };
}

/**
 * Full search (legacy) — uses cache when available.
 * Supports AbortSignal + instant cache.
 * Returns { results, total }
 */
export async function searchMovies(query, options = {}) {
  const q = query?.trim();
  if (!q) return { results: [], total: 0 };

  const cached = getSearchCache(q);
  if (cached && !options.skipCache) return cached;

  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

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

/** Preload disabled — avoids background API calls after first load */
export function preloadPopularSearches() {
  /* no-op */
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
  const cached = getCacheEntry(cacheKey, 1000 * 60 * 60 * 24 * 7);
  if (cached) return cached;
  const local = getMovieFromCatalog(id);
  if (local) {
    setCacheEntry(cacheKey, local);
    return local;
  }
  const data = await apiFetch(`/movie/${encodeURIComponent(id)}`, { timeout: 6_000 }, 0);
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
let rowsPromise = null;
let rowsFrozen = false;

function hydrateRowsCache() {
  if (rowsCache?.rows?.length) return;
  for (const key of ['sf_home_bootstrap_v1']) {
    try {
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (data?.rows?.length) {
        rowsCache = data;
        rowsFrozen = true;
        return;
      }
    } catch {
      /* ignore */
    }
  }
}

hydrateRowsCache();

/** Keep api rows cache aligned with homeStore */
export function syncRowsCache(data) {
  if (data?.rows?.length) {
    rowsCache = data;
    rowsFrozen = true;
  }
}

/** Sync read for instant first paint from prior session or movies cache */
export function getInstantHomeFromCache() {
  hydrateRowsCache();
  if (rowsCache?.rows?.length) return rowsCache;
  const movies = getCacheEntry('all');
  if (movies?.length) {
    const built = buildClientRows(movies);
    if (built.rows.length) return built;
  }
  return getOfflineHome();
}

/** @deprecated use warmHomeCache from homeStore */
export function prefetchHomeCatalog() {
  /* warmHomeCache() runs on homeStore import */
}

export function resetRowsCache() {
  rowsCache = null;
  rowsPromise = null;
  rowsFrozen = false;
}

export async function fetchRows({ fresh = false } = {}) {
  if (fresh) resetRowsCache();
  if (!fresh && rowsFrozen && rowsCache?.rows?.length) return rowsCache;
  if (!fresh && rowsCache?.rows?.length) {
    rowsFrozen = true;
    return rowsCache;
  }
  if (!fresh && rowsPromise) return rowsPromise;

  const catalogQuick = fetchAllMovies()
    .then((movies) => {
      const built = buildClientRows(movies);
      return built.rows.length ? built : null;
    })
    .catch(() => null);

  rowsPromise = (async () => {
    try {
      const data = await apiFetch('/rows', { timeout: 8_000 }, 0);
      if (Array.isArray(data?.rows) && data.rows.length) {
        rowsCache = data;
        rowsFrozen = true;
        return data;
      }
    } catch {
      /* fall through */
    }
    const quick = await catalogQuick;
    if (quick?.rows?.length) {
      rowsCache = quick;
      rowsFrozen = true;
      return quick;
    }
    if (rowsCache?.rows?.length) {
      rowsFrozen = true;
      return rowsCache;
    }
    throw new Error('Could not load catalog');
  })();

  try {
    return await rowsPromise;
  } finally {
    rowsPromise = null;
  }
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

const streamCache = new Map();

export function prefetchStream(movie, season = null, episode = null) {
  const id = movie?.imdbId || (movie?.tmdbId != null ? String(movie.tmdbId) : null);
  if (!id) return;
  fetchStreamProviders(id, season, episode).catch(() => {});
}

export async function fetchStreamProviders(id, season, episode) {
  const key = `${id}:${season || ''}:${episode || ''}`;
  if (streamCache.has(key)) return streamCache.get(key);

  let path = `/stream/${encodeURIComponent(id)}`;
  const params = new URLSearchParams();
  if (season) params.set('season', season);
  if (episode) params.set('episode', episode);
  if (params.toString()) path += `?${params}`;

  const data = await apiFetch(path, { timeout: 6_000 }, 0);
  streamCache.set(key, data);
  return data;
}

export async function probeStreamUrl(url) {
  try {
    const data = await apiFetch(`/probe?url=${encodeURIComponent(url)}`, { timeout: 4_000 }, 0);
    return data.ok === true;
  } catch {
    return false;
  }
}

export async function probeStreamUrls(urls) {
  if (!urls.length) return [];
  const first = await probeStreamUrl(urls[0]);
  if (urls.length === 1) return [first];
  const rest = await Promise.all(urls.slice(1).map((url) => probeStreamUrl(url)));
  return [first, ...rest];
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
