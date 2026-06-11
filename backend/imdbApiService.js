/**
 * IMDb API (imdbapi.dev) — fast title search + lookup
 * https://api.imdbapi.dev/titles?q={query}&types=MOVIE&types=TV_SERIES
 */

const IMDB_API_BASE = 'https://api.imdbapi.dev';
const PLACEHOLDER = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=640&q=80';

const searchCache = new Map();
const titleCache = new Map();
const CACHE_TTL = 1000 * 60 * 15;

function cacheGet(map, key) {
  const e = map.get(key);
  if (!e || Date.now() - e.at > CACHE_TTL) return null;
  return e.data;
}

function cacheSet(map, key, data) {
  map.set(key, { data, at: Date.now() });
}

function relevanceScore(title, query) {
  const t = (title || '').toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 85;
  if (t.includes(q)) return 70;
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return 0;
  const matched = words.filter((w) => t.includes(w)).length;
  return Math.round((matched / words.length) * 55);
}

function dedupeByImdbId(list) {
  const seen = new Set();
  return list.filter((m) => {
    if (!m?.imdbId || seen.has(m.imdbId)) return false;
    seen.add(m.imdbId);
    return true;
  });
}

/** Normalize imdbapi.dev title → app movie shape */
export function normalizeImdbApiTitle(item) {
  if (!item?.id?.startsWith('tt')) return null;

  const rawType = (item.type || '').toLowerCase();
  const type = rawType.includes('tv') || rawType === 'tv_series' ? 'tv' : 'movie';

  const poster = item.primaryImage?.url || null;

  return {
    imdbId: item.id,
    title: item.primaryTitle || item.originalTitle || 'Unknown',
    year: String(item.startYear || item.endYear || ''),
    poster: poster || PLACEHOLDER,
    backdrop: poster || PLACEHOLDER,
    type,
    plot: item.plot || '',
    genre: Array.isArray(item.genres) ? item.genres.join(', ') : '',
    rating: item.rating?.aggregateRating != null ? String(item.rating.aggregateRating) : null,
    seasons: type === 'tv' ? item.numberOfSeasons || null : null,
  };
}

/** Fetch single title by IMDb id */
export async function fetchImdbApiById(imdbId) {
  const cached = cacheGet(titleCache, imdbId);
  if (cached) return cached;

  try {
    const res = await fetch(`${IMDB_API_BASE}/titles/${imdbId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const movie = normalizeImdbApiTitle(data);
    if (movie) cacheSet(titleCache, imdbId, movie);
    return movie;
  } catch {
    return null;
  }
}

/**
 * Search titles — one fast API call, relevance-ranked.
 * Returns { results, total, relevanceHits }
 */
export async function searchImdbApi(query) {
  const q = query.trim();
  if (!q) return { results: [], total: 0, relevanceHits: 0 };

  const cacheKey = q.toLowerCase();
  const cached = cacheGet(searchCache, cacheKey);
  if (cached) return cached;

  const url = new URL(`${IMDB_API_BASE}/titles`);
  url.searchParams.set('q', q);
  url.searchParams.append('types', 'MOVIE');
  url.searchParams.append('types', 'TV_SERIES');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`imdbapi ${res.status}`);

  const data = await res.json();
  const raw = Array.isArray(data.titles) ? data.titles : [];

  const normalized = dedupeByImdbId(
    raw.map(normalizeImdbApiTitle).filter(Boolean)
  );

  const scored = normalized
    .map((m) => ({ ...m, _score: relevanceScore(m.title, q) }))
    .sort((a, b) => b._score - a._score);

  const relevant = scored.filter((m) => m._score >= 25);
  const results = (relevant.length >= 3 ? relevant : scored)
    .map(({ _score, ...m }) => m);

  const payload = {
    results,
    total: results.length,
    relevanceHits: relevant.length,
  };

  cacheSet(searchCache, cacheKey, payload);
  return payload;
}

export { PLACEHOLDER };
