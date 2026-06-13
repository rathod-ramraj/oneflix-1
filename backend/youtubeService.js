/**
 * YouTube Data API v3 — official trailer lookup
 * https://developers.google.com/youtube/v3/docs/search/list
 */

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_TTL) return null;
  return hit.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, at: Date.now() });
}

function parseYear(movie) {
  const match = String(movie?.year || '').match(/\d{4}/);
  return match ? match[0] : '';
}

function trailerScore(snippet, title) {
  const t = (snippet?.title || '').toLowerCase();
  const needle = title.toLowerCase();
  let score = 0;
  if (t.includes('trailer')) score += 6;
  if (t.includes('official')) score += 4;
  if (t.includes('teaser')) score += 2;
  if (needle && t.includes(needle.split(/\s+/)[0])) score += 2;
  if (/reaction|review|explained|breakdown|clip|scene|fan made|fanmade/.test(t)) score -= 8;
  return score;
}

async function searchVideos(apiKey, query) {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: '6',
    key: apiKey,
    videoEmbeddable: 'true',
    safeSearch: 'none',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function pickBest(items, title) {
  const ranked = items
    .filter((item) => item.id?.videoId && item.snippet)
    .map((item) => ({ item, score: trailerScore(item.snippet, title) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked.find((r) => r.score > 0) || ranked[0];
  if (!best || best.score < -2) return null;
  return {
    videoId: best.item.id.videoId,
    title: best.item.snippet.title,
  };
}

function toPayload(video) {
  const id = video.videoId;
  return {
    videoId: id,
    title: video.title,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

/** Find best official trailer for a title */
export async function fetchYoutubeTrailer(apiKey, movie) {
  if (!apiKey || !movie?.title) return null;

  const cacheKey = movie.imdbId || `${movie.title}|${movie.year || ''}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const year = parseYear(movie);
  const isTv = movie.type === 'tv';
  const queries = [
    `${movie.title} ${year} official trailer`.trim(),
    `${movie.title} official trailer`,
    isTv ? `${movie.title} ${year} series trailer`.trim() : `${movie.title} ${year} trailer`.trim(),
  ];

  for (const query of queries) {
    const items = await searchVideos(apiKey, query);
    const picked = pickBest(items, movie.title);
    if (picked) {
      const payload = toPayload(picked);
      cacheSet(cacheKey, payload);
      return payload;
    }
  }

  cacheSet(cacheKey, null);
  return null;
}
