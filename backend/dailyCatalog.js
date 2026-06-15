import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, 'daily-catalog.json');
const MOVIES_PATH = path.join(__dirname, 'movies.json');
const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;
const IMDB_CONCURRENCY = 6;

let memory = null;
let inflight = null;

async function tmdbFetch(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`TMDB ${res.status}`);
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return null;
}

async function tmdbGet(tmdbKey, endpoint) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const data = await tmdbFetch(`https://api.themoviedb.org/3/${endpoint}${sep}api_key=${tmdbKey}`);
  return data?.results || [];
}

async function tmdbImdbId(tmdbKey, type, id) {
  try {
    const pathType = type === 'tv' ? 'tv' : 'movie';
    const data = await tmdbFetch(
      `https://api.themoviedb.org/3/${pathType}/${id}/external_ids?api_key=${tmdbKey}`,
      1,
    );
    return data?.imdb_id || null;
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
    genre: '',
    rating: item.vote_average ? item.vote_average.toFixed(1) : null,
    recent: true,
    daily: true,
  };
}

function normalizeLocal(m) {
  if (!m?.title) return null;
  return {
    title: m.title,
    year: m.year,
    imdbId: m.imdbId || null,
    tmdbId: m.tmdbId || null,
    type: m.type === 'tv' ? 'tv' : 'movie',
    poster: m.poster || null,
    backdrop: m.backdrop || null,
    plot: m.plot || '',
    genre: m.genre || '',
    rating: m.rating || null,
    recent: Boolean(m.recent),
    daily: true,
  };
}

async function mapList(tmdbKey, items, type, limit = 15) {
  const slice = items.slice(0, limit);
  const seen = new Set();
  let i = 0;
  const out = [];

  async function worker() {
    while (i < slice.length) {
      const item = slice[i++];
      const imdbId = await tmdbImdbId(tmdbKey, type, item.id);
      const norm = normalizeItem(item, type, imdbId);
      if (!norm) continue;
      const key = imdbId || `tmdb:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(norm);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(IMDB_CONCURRENCY, slice.length) }, worker),
  );
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
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
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

function parseYear(m) {
  const match = String(m?.year || '').match(/\d{4}/);
  return match ? parseInt(match[0], 10) : 0;
}

export function buildLocalDailyCatalog() {
  try {
    const raw = JSON.parse(fs.readFileSync(MOVIES_PATH, 'utf-8'));
    const movies = raw.filter((m) => m.poster && m.poster !== 'N/A');
    const featureFilms = movies.filter((m) => m.type === 'movie');
    const tvShows = movies.filter((m) => m.type === 'tv');
    const cutoff = new Date().getFullYear() - 2;

    const latestMovies = movies
      .filter((m) => m.type === 'movie' && (m.recent || parseYear(m) >= cutoff))
      .sort((a, b) => parseYear(b) - parseYear(a))
      .slice(0, 16)
      .map(normalizeLocal)
      .filter(Boolean);

    const latestTv = movies
      .filter((m) => m.type === 'tv' && (m.recent || parseYear(m) >= cutoff))
      .sort((a, b) => parseYear(b) - parseYear(a))
      .slice(0, 16)
      .map(normalizeLocal)
      .filter(Boolean);

    const topRatedMovies = [...featureFilms]
      .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
      .slice(0, 14)
      .map(normalizeLocal)
      .filter(Boolean);

    const topRatedTv = [...tvShows]
      .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
      .slice(0, 14)
      .map(normalizeLocal)
      .filter(Boolean);

    const heroPool = dedupeLists(latestMovies, latestTv, topRatedMovies, topRatedTv)
      .filter((m) => m.poster || m.backdrop)
      .slice(0, 18);

    return {
      fetchedAt: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      source: 'local',
      latestMovies,
      latestTv,
      topRatedMovies,
      topRatedTv,
      heroPool,
    };
  } catch {
    return {
      fetchedAt: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      source: 'local',
      latestMovies: [],
      latestTv: [],
      topRatedMovies: [],
      topRatedTv: [],
      heroPool: [],
    };
  }
}

async function fetchFresh(tmdbKey) {
  const settled = await Promise.allSettled([
    tmdbGet(tmdbKey, 'trending/movie/week'),
    tmdbGet(tmdbKey, 'trending/tv/week'),
    tmdbGet(tmdbKey, 'movie/now_playing'),
    tmdbGet(tmdbKey, 'tv/on_the_air'),
    tmdbGet(tmdbKey, 'movie/top_rated'),
    tmdbGet(tmdbKey, 'tv/top_rated'),
  ]);

  const pick = (i) => (settled[i].status === 'fulfilled' ? settled[i].value : []);
  const trendingMovies = pick(0);
  const trendingTv = pick(1);
  const nowPlaying = pick(2);
  const onAir = pick(3);
  const topMovies = pick(4);
  const topTv = pick(5);

  const okCount = settled.filter((s) => s.status === 'fulfilled' && s.value?.length).length;
  if (!okCount) throw new Error('TMDB unreachable');

  const [latestMovies, latestTv, topRatedMovies, topRatedTv] = await Promise.all([
    mapList(tmdbKey, dedupeLists(nowPlaying, trendingMovies), 'movie', 16),
    mapList(tmdbKey, dedupeLists(onAir, trendingTv), 'tv', 16),
    mapList(tmdbKey, topMovies, 'movie', 14),
    mapList(tmdbKey, topTv, 'tv', 14),
  ]);

  if (!latestMovies.length && !latestTv.length && !topRatedMovies.length && !topRatedTv.length) {
    throw new Error('TMDB returned no titles');
  }

  const heroPool = dedupeLists(latestMovies, latestTv, topRatedMovies, topRatedTv)
    .filter((m) => m.poster || m.backdrop)
    .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
    .slice(0, 18);

  const payload = {
    fetchedAt: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    source: 'tmdb',
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

function scheduleRefresh(tmdbKey) {
  if (!tmdbKey || inflight) return;
  inflight = fetchFresh(tmdbKey)
    .catch((err) => {
      console.warn('[daily] TMDB fetch failed:', err?.message);
      return null;
    })
    .finally(() => {
      inflight = null;
    });
}

export async function getDailyCatalog(tmdbKey) {
  if (memory?.latestMovies?.length || memory?.latestTv?.length) {
    if (!isFresh(memory)) scheduleRefresh(tmdbKey);
    return memory;
  }

  const cached = readCache();
  if (cached?.heroPool?.length || cached?.latestMovies?.length) {
    memory = cached;
    if (!isFresh(cached)) scheduleRefresh(tmdbKey);
    return cached;
  }

  const local = buildLocalDailyCatalog();
  memory = local;
  scheduleRefresh(tmdbKey);

  if (tmdbKey && !inflight) {
    try {
      const fresh = await Promise.race([
        fetchFresh(tmdbKey),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 25_000)),
      ]);
      if (fresh) return fresh;
    } catch (err) {
      console.warn('[daily] TMDB fetch failed:', err?.message);
    }
  }

  return local;
}

export function warmDailyCatalog(tmdbKey) {
  getDailyCatalog(tmdbKey).catch(() => {});
}
