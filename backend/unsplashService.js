/**
 * Unsplash API — full HD poster/backdrop fallback (last resort only)
 * Supports multiple access keys to spread rate limits.
 */

const searchCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 12;
const MAX_REQUESTS_PER_MIN = 20;

/** @type {{ accessKey: string, appId?: string, windowStart: number, windowCount: number }[]} */
const keyPools = [];

function normalizeKeys(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  return [...new Set(list.map((k) => String(k).trim()).filter(Boolean))];
}

/** Register one or more Unsplash Client-ID access keys */
export function configureUnsplashKeys(keys, appIds = []) {
  keyPools.length = 0;
  normalizeKeys(keys).forEach((accessKey, i) => {
    keyPools.push({
      accessKey,
      appId: appIds[i] || '',
      windowStart: Date.now(),
      windowCount: 0,
    });
  });
}

function cacheGet(key) {
  const e = searchCache.get(key);
  if (!e || Date.now() - e.at > CACHE_TTL) return null;
  return e.data;
}

function cacheSet(key, data) {
  searchCache.set(key, { data, at: Date.now() });
}

async function throttlePool(pool) {
  const now = Date.now();
  if (now - pool.windowStart >= 60_000) {
    pool.windowStart = now;
    pool.windowCount = 0;
  }
  if (pool.windowCount >= MAX_REQUESTS_PER_MIN) {
    await new Promise((r) => setTimeout(r, 60_000 - (now - pool.windowStart)));
    pool.windowStart = Date.now();
    pool.windowCount = 0;
  }
  pool.windowCount += 1;
}

function orderedPools(seed) {
  if (!keyPools.length) return [];
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const start = h % keyPools.length;
  return keyPools.map((_, i) => keyPools[(start + i) % keyPools.length]);
}

function hdUrl(rawUrl, { w, h, fit = 'crop', q = 90 } = {}) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    u.searchParams.set('w', String(w));
    if (h) u.searchParams.set('h', String(h));
    u.searchParams.set('fit', fit);
    u.searchParams.set('q', String(q));
    u.searchParams.set('auto', 'format');
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function photoToUrls(photo, orientation) {
  const base = photo.urls?.raw || photo.urls?.full || photo.urls?.regular;
  if (!base) return null;

  if (orientation === 'portrait') {
    return {
      poster: hdUrl(base, { w: 1200, h: 1800 }),
      backdrop: hdUrl(base, { w: 1920, h: 1080 }),
    };
  }

  return {
    poster: hdUrl(base, { w: 1200, h: 1800 }),
    backdrop: hdUrl(base, { w: 1920, h: 1080 }),
  };
}

async function searchPhotos(pool, query, orientation) {
  await throttlePool(pool);
  const params = new URLSearchParams({
    query,
    per_page: '3',
    content_filter: 'high',
  });
  if (orientation) params.set('orientation', orientation);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${pool.accessKey}` },
      signal: controller.signal,
    });
    if (res.status === 403 || res.status === 429) return { rateLimited: true };
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data.results?.[0];
    if (!photo?.urls) return null;
    return {
      ...photoToUrls(photo, orientation),
      id: photo.id,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchWithFailover(seed, query, orientation) {
  for (const pool of orderedPools(seed)) {
    const result = await searchPhotos(pool, query, orientation);
    if (result?.rateLimited) continue;
    if (result) return result;
  }
  return null;
}

/** Search Unsplash for full HD cinematic images matching the title */
export async function fetchUnsplashImages(accessKeys, title, genre = '', type = 'movie') {
  const keys = normalizeKeys(accessKeys);
  if (!keys.length && !keyPools.length) return null;
  if (keys.length) configureUnsplashKeys(keys);
  if (!keyPools.length || !title) return null;

  const cacheKey = `${title.toLowerCase()}|${(genre || '').split(',')[0].toLowerCase()}|${type}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const seed = title;
  const genreBit = genre ? `${genre.split(',')[0].trim()} ` : '';
  const isTv = type === 'tv';
  const typeBit = isTv ? 'tv series show' : 'movie film';
  const queries = [
    `${title} ${typeBit} cinematic poster`,
    `${genreBit}${title} ${isTv ? 'series' : 'movie'} still`,
  ];

  for (const query of queries) {
    const portrait = await searchWithFailover(seed, query, 'portrait');
    if (portrait?.poster) {
      let backdrop = portrait.backdrop;
      if (!backdrop) {
        const landscape = await searchWithFailover(seed, query, 'landscape');
        backdrop = landscape?.backdrop || portrait.backdrop;
      }
      const result = { poster: portrait.poster, backdrop };
      cacheSet(cacheKey, result);
      return result;
    }
  }

  const landscape = await searchWithFailover(seed, `${title} cinematic`, 'landscape');
  if (landscape?.backdrop) {
    const result = { poster: landscape.poster, backdrop: landscape.backdrop };
    cacheSet(cacheKey, result);
    return result;
  }

  return null;
}

export async function fetchUnsplashPoster(accessKeys, title, genre = '', type = 'movie') {
  const images = await fetchUnsplashImages(accessKeys, title, genre, type);
  return images?.poster || null;
}

export async function fetchUnsplashBackdrop(accessKeys, title, genre = '', type = 'movie') {
  const images = await fetchUnsplashImages(accessKeys, title, genre, type);
  return images?.backdrop || null;
}
