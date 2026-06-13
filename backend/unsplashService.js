/**
 * Unsplash API — full HD poster/backdrop fallback (last resort only)
 * https://unsplash.com/documentation#search-photos
 */

const searchCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 12;
const MAX_REQUESTS_PER_MIN = 20;
let windowStart = Date.now();
let windowCount = 0;

function cacheGet(key) {
  const e = searchCache.get(key);
  if (!e || Date.now() - e.at > CACHE_TTL) return null;
  return e.data;
}

function cacheSet(key, data) {
  searchCache.set(key, { data, at: Date.now() });
}

async function throttleUnsplash() {
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_REQUESTS_PER_MIN) {
    await new Promise((r) => setTimeout(r, 60_000 - (now - windowStart)));
    windowStart = Date.now();
    windowCount = 0;
  }
  windowCount += 1;
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

async function searchPhotos(accessKey, query, orientation) {
  await throttleUnsplash();
  const params = new URLSearchParams({
    query,
    per_page: '3',
    content_filter: 'high',
  });
  if (orientation) params.set('orientation', orientation);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let res;
  try {
    res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return null;
  const data = await res.json();
  const photo = data.results?.[0];
  if (!photo?.urls) return null;

  return {
    ...photoToUrls(photo, orientation),
    id: photo.id,
  };
}

/** Search Unsplash for full HD cinematic images matching the title */
export async function fetchUnsplashImages(accessKey, title, genre = '', type = 'movie') {
  if (!accessKey || !title) return null;

  const cacheKey = `${title.toLowerCase()}|${(genre || '').split(',')[0].toLowerCase()}|${type}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const genreBit = genre ? `${genre.split(',')[0].trim()} ` : '';
  const isTv = type === 'tv';
  const typeBit = isTv ? 'tv series show' : 'movie film';
  const queries = [
    `${title} ${typeBit} cinematic poster`,
    `${genreBit}${title} ${isTv ? 'series' : 'movie'} still`,
  ];

  for (const query of queries) {
    const portrait = await searchPhotos(accessKey, query, 'portrait');
    if (portrait?.poster) {
      let backdrop = portrait.backdrop;
      if (!backdrop) {
        const landscape = await searchPhotos(accessKey, query, 'landscape');
        backdrop = landscape?.backdrop || portrait.backdrop;
      }
      const result = { poster: portrait.poster, backdrop };
      cacheSet(cacheKey, result);
      return result;
    }
  }

  const landscape = await searchPhotos(accessKey, `${title} cinematic`, 'landscape');
  if (landscape?.backdrop) {
    const result = {
      poster: landscape.poster,
      backdrop: landscape.backdrop,
    };
    cacheSet(cacheKey, result);
    return result;
  }

  return null;
}

export async function fetchUnsplashPoster(accessKey, title, genre = '', type = 'movie') {
  const images = await fetchUnsplashImages(accessKey, title, genre, type);
  return images?.poster || null;
}

export async function fetchUnsplashBackdrop(accessKey, title, genre = '', type = 'movie') {
  const images = await fetchUnsplashImages(accessKey, title, genre, type);
  return images?.backdrop || null;
}
