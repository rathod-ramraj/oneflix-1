/**
 * Unsplash API — poster/backdrop fallback
 * https://unsplash.com/documentation#search-photos
 */

const searchCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 12;

function cacheGet(key) {
  const e = searchCache.get(key);
  if (!e || Date.now() - e.at > CACHE_TTL) return null;
  return e.data;
}

function cacheSet(key, data) {
  searchCache.set(key, { data, at: Date.now() });
}

async function searchPhotos(accessKey, query, orientation) {
  const params = new URLSearchParams({
    query,
    per_page: '1',
    content_filter: 'high',
  });
  if (orientation) params.set('orientation', orientation);

  const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  const photo = data.results?.[0];
  if (!photo?.urls) return null;

  return {
    poster: photo.urls.small || photo.urls.regular,
    backdrop: photo.urls.regular || photo.urls.full,
    id: photo.id,
  };
}

/** Search Unsplash for a cinematic image matching the title */
export async function fetchUnsplashImages(accessKey, title, genre = '') {
  if (!accessKey || !title) return null;

  const cacheKey = `${title.toLowerCase()}|${(genre || '').split(',')[0].toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const genreBit = genre ? `${genre.split(',')[0]} ` : '';
  const queries = [
    `${title} movie poster`,
    `${genreBit}${title} cinema`,
    `${title} film`,
  ];

  for (const query of queries) {
    const portrait = await searchPhotos(accessKey, query, 'portrait');
    if (portrait?.poster) {
      const landscape = await searchPhotos(accessKey, query, 'landscape');
      const result = {
        poster: portrait.poster,
        backdrop: landscape?.backdrop || portrait.backdrop,
      };
      cacheSet(cacheKey, result);
      return result;
    }
  }

  return null;
}
