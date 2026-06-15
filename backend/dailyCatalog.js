import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, 'daily-catalog.json');
const DAY_MS = 24 * 60 * 60 * 1000;

let memory = null;
let inflight = null;

async function tmdbGet(tmdbKey, endpoint) {
  const url = `https://api.themoviedb.org/3/${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${tmdbKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function tmdbImdbId(tmdbKey, type, id) {
  try {
    const pathType = type === 'tv' ? 'tv' : 'movie';
    const res = await fetch(
      `https://api.themoviedb.org/3/${pathType}/${id}/external_ids?api_key=${tmdbKey}`,
    );
    const data = await res.json();
    return data.imdb_id || null;
  } catch {
    return null;
  }
}

function normalizeItem(item, type, imdbId) {
  if (!item?.id) return null;
  const title = item.title || item.name;
  if (!title) return null;
  return {
    title,
    year: (item.release_date || item.first_air_date || '').slice(0, 4),
    imdbId: imdbId || null,
    tmdbId: item.id,
    type: type === 'tv' ? 'tv' : 'movie',
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w780${item.poster_path}` : null,
    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
    plot: item.overview || '',
    genre: (item.genre_ids || []).length ? '' : '',
    rating: item.vote_average ? item.vote_average.toFixed(1) : null,
    recent: true,
    daily: true,
  };
}

async function mapList(tmdbKey, items, type, limit = 15) {
  const slice = items.slice(0, limit);
  const out = [];
  const seen = new Set();

  for (const item of slice) {
    const imdbId = await tmdbImdbId(tmdbKey, type, item.id);
    const norm = normalizeItem(item, type, imdbId);
    if (!norm) continue;
    const key = imdbId || `tmdb:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

function dedupeLists(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const m of list || []) {
      const key = m.imdbId || `tmdb:${m.tmdbId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    if (!data?.fetchedAt) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data));
  } catch (err) {
    console.warn('[daily] cache write failed:', err?.message);
  }
}

function isFresh(data) {
  return data?.fetchedAt && Date.now() - data.fetchedAt < DAY_MS;
}

async function fetchFresh(tmdbKey) {
  const [
    trendingMovies,
    trendingTv,
    nowPlaying,
    onAir,
    topMovies,
    topTv,
  ] = await Promise.all([
    tmdbGet(tmdbKey, 'trending/movie/week'),
    tmdbGet(tmdbKey, 'trending/tv/week'),
    tmdbGet(tmdbKey, 'movie/now_playing'),
    tmdbGet(tmdbKey, 'tv/on_the_air'),
    tmdbGet(tmdbKey, 'movie/top_rated'),
    tmdbGet(tmdbKey, 'tv/top_rated'),
  ]);

  const [latestMovies, latestTv, topRatedMovies, topRatedTv] = await Promise.all([
    mapList(tmdbKey, dedupeLists(nowPlaying, trendingMovies), 'movie', 16),
    mapList(tmdbKey, dedupeLists(onAir, trendingTv), 'tv', 16),
    mapList(tmdbKey, topMovies, 'movie', 14),
    mapList(tmdbKey, topTv, 'tv', 14),
  ]);

  const heroPool = dedupeLists(latestMovies, latestTv, topRatedMovies, topRatedTv)
    .filter((m) => m.poster || m.backdrop)
    .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
    .slice(0, 18);

  const payload = {
    fetchedAt: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    latestMovies,
    latestTv,
    topRatedMovies,
    topRatedTv,
    heroPool,
  };

  memory = payload;
  writeCache(payload);
  return payload;
}

/** TMDB catalog — refreshes once per day */
export async function getDailyCatalog(tmdbKey) {
  if (memory && isFresh(memory)) return memory;

  const cached = readCache();
  if (cached && isFresh(cached)) {
    memory = cached;
    return cached;
  }

  if (!tmdbKey) {
    return cached || {
      fetchedAt: 0,
      latestMovies: [],
      latestTv: [],
      topRatedMovies: [],
      topRatedTv: [],
      heroPool: [],
    };
  }

  if (inflight) return inflight;

  inflight = fetchFresh(tmdbKey)
    .catch((err) => {
      console.warn('[daily] TMDB fetch failed:', err?.message);
      if (cached) return cached;
      return {
        fetchedAt: Date.now(),
        latestMovies: [],
        latestTv: [],
        topRatedMovies: [],
        topRatedTv: [],
        heroPool: [],
      };
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Warm cache on server boot */
export function warmDailyCatalog(tmdbKey) {
  if (!tmdbKey) return;
  getDailyCatalog(tmdbKey).catch(() => {});
}
