/**
 * OMDb + TMDB helpers (backend only — keys never sent to browser)
 */

const PLACEHOLDER = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=640&q=80';
const OMDB_BASE = 'https://www.omdbapi.com/';

const searchCache = new Map();
const movieCache = new Map();
const tmdbIdCache = new Map();
const CACHE_TTL = 1000 * 60 * 30;

function cacheGet(map, key) {
  const e = map.get(key);
  if (!e || Date.now() - e.at > CACHE_TTL) return null;
  return e.data;
}

function cacheSet(map, key, data) {
  map.set(key, { data, at: Date.now() });
}

/** Normalize OMDb search/detail item → app movie shape */
export function normalizeOmdbItem(item, extras = {}) {
  const imdbId = item.imdbID || item.imdbId;
  if (!imdbId || imdbId === 'N/A') return null;

  const rawType = (item.Type || item.type || '').toLowerCase();
  if (rawType === 'episode' || rawType === 'game') return null;

  let type = 'movie';
  if (rawType === 'series' || rawType === 'tv') type = 'tv';

  const posterRaw = item.Poster || item.poster;
  const poster = posterRaw && posterRaw !== 'N/A' ? posterRaw : extras.poster || null;

  return {
    title: item.Title || item.title || 'Unknown',
    year: item.Year || item.year || '',
    imdbId,
    tmdbId: extras.tmdbId || item.tmdbId || null,
    type,
    poster,
    backdrop: extras.backdrop || poster,
    plot: item.Plot && item.Plot !== 'N/A' ? item.Plot : item.plot || '',
    genre: item.Genre && item.Genre !== 'N/A' ? item.Genre : item.genre || '',
    rating: item.imdbRating && item.imdbRating !== 'N/A' ? item.imdbRating : item.rating || null,
    runtime: item.Runtime && item.Runtime !== 'N/A' ? item.Runtime : item.runtime || null,
    seasons: extras.seasons || item.seasons || null,
    cast: item.Actors && item.Actors !== 'N/A' ? item.Actors : item.cast || null,
    director: item.Director && item.Director !== 'N/A' ? item.Director : item.director || null,
  };
}

function relevanceScore(title, query) {
  const t = title.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  const qWords = q.split(/\s+/).filter(Boolean);
  const matched = qWords.filter((w) => t.includes(w)).length;
  return (matched / qWords.length) * 40;
}

function dedupeMovies(list) {
  const seen = new Set();
  return list.filter((m) => {
    if (!m?.imdbId || seen.has(m.imdbId)) return false;
    seen.add(m.imdbId);
    return true;
  });
}

/** Levenshtein-lite: words overlap for typo tolerance */
function fuzzyLocalMatch(title, query) {
  const t = title.toLowerCase();
  const q = query.toLowerCase().trim();
  if (t.includes(q)) return true;
  const qWords = q.split(/\s+/).filter((w) => w.length > 2);
  if (!qWords.length) return false;
  return qWords.every((w) => t.includes(w) || t.split(/\s+/).some((tw) => tw.startsWith(w.slice(0, 3))));
}

export async function fetchOmdbPage(apiKey, query, page = 1, type = '') {
  const params = new URLSearchParams({
    apikey: apiKey,
    s: query,
    page: String(page),
  });
  if (type) params.set('type', type);

  const res = await fetch(`${OMDB_BASE}?${params}`);
  const data = await res.json();
  if (data.Response !== 'True' || !Array.isArray(data.Search)) {
    if (data.Error) console.warn('[OMDb]', data.Error, { query, page, type });
    return { items: [], totalResults: 0, error: data.Error };
  }
  return {
    items: data.Search,
    totalResults: parseInt(data.totalResults, 10) || 0,
  };
}

/** Fetch all OMDb search pages — untyped + movie + series (deduped) */
export async function searchOmdbAll(apiKey, query, maxPages = 25) {
  const cacheKey = `omdb:${query.toLowerCase()}:${maxPages}`;
  const cached = cacheGet(searchCache, cacheKey);
  if (cached) return cached;

  const merged = [];
  // '' = broadest match; then typed passes for anything missed
  const types = ['', 'movie', 'series'];

  for (const type of types) {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= maxPages) {
      const { items, totalResults } = await fetchOmdbPage(apiKey, query, page, type);
      if (!items.length) break;
      totalPages = Math.min(Math.ceil(totalResults / 10), maxPages);
      merged.push(...items);
      page += 1;
    }
  }

  const normalized = dedupeMovies(
    merged.map((item) => normalizeOmdbItem(item)).filter(Boolean)
  );

  cacheSet(searchCache, cacheKey, normalized);
  return normalized;
}

export async function fetchOmdbById(apiKey, imdbId) {
  const cached = cacheGet(movieCache, imdbId);
  if (cached) return cached;

  const res = await fetch(`${OMDB_BASE}?apikey=${apiKey}&i=${imdbId}&plot=full`);
  const data = await res.json();
  if (data.Response !== 'True') return null;

  const movie = normalizeOmdbItem(data);
  if (movie) cacheSet(movieCache, imdbId, movie);
  return movie;
}

function tmdbToResult(item, type) {
  if (!item) return null;
  return {
    tmdbId: item.id,
    type,
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w780${item.poster_path}` : null,
    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
    seasons: null,
  };
}

export async function findTmdbByImdb(tmdbKey, imdbId, preferType) {
  if (!tmdbKey || !imdbId) return null;
  const cached = cacheGet(tmdbIdCache, imdbId);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${tmdbKey}`
    );
    const data = await res.json();
    const tv = data.tv_results?.[0];
    const mov = data.movie_results?.[0];

    let result = null;
    if (preferType === 'tv') {
      result = tmdbToResult(tv, 'tv') || tmdbToResult(mov, 'movie');
    } else if (preferType === 'movie') {
      result = tmdbToResult(mov, 'movie') || tmdbToResult(tv, 'tv');
    } else {
      result = tmdbToResult(tv, 'tv') || tmdbToResult(mov, 'movie');
    }

    if (result) cacheSet(tmdbIdCache, imdbId, result);
    return result;
  } catch {
    return null;
  }
}

async function fetchTmdbImdbId(tmdbKey, mediaType, id) {
  const path = mediaType === 'tv' ? 'tv' : 'movie';
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${path}/${id}/external_ids?api_key=${tmdbKey}`
    );
    const data = await res.json();
    return data.imdb_id || null;
  } catch {
    return null;
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** TMDB search — adds titles OMDb may miss (maps to imdbId for streaming) */
export async function searchTmdbAll(tmdbKey, query, maxPages = 10) {
  const cacheKey = `tmdbsearch:${query.toLowerCase()}:${maxPages}`;
  const cached = cacheGet(searchCache, cacheKey);
  if (cached) return cached;

  const raw = [];
  for (const type of ['movie', 'tv']) {
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://api.themoviedb.org/3/search/${type}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}&page=${page}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.results?.length) break;
      for (const item of data.results) raw.push({ item, type });
      if (page >= (data.total_pages || 1) || page >= maxPages) break;
    }
  }

  const slice = raw.slice(0, 40);
  const withImdb = await mapWithConcurrency(slice, 10, async ({ item, type }) => {
    const imdbId = await fetchTmdbImdbId(tmdbKey, type, item.id);
    if (!imdbId) return null;
    return {
      title: item.title || item.name || 'Unknown',
      year: (item.release_date || item.first_air_date || '').slice(0, 4),
      imdbId,
      tmdbId: item.id,
      type: type === 'tv' ? 'tv' : 'movie',
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w780${item.poster_path}` : null,
      backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
      plot: item.overview || '',
      genre: '',
      rating: item.vote_average ? item.vote_average.toFixed(1) : null,
    };
  });

  const normalized = dedupeMovies(withImdb.filter(Boolean));
  cacheSet(searchCache, cacheKey, normalized);
  return normalized;
}

export async function getTmdbTvSeasons(tmdbKey, tmdbId) {
  if (!tmdbKey || !tmdbId) return null;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbKey}`);
    const data = await res.json();
    if (data.success === false) return null;
    const count = data.number_of_seasons || 1;
    return {
      seasons: count,
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w780${data.poster_path}` : null,
    };
  } catch {
    return null;
  }
}

/** Resolve a numeric TMDB id to app movie shape (movie or tv) */
export async function fetchTmdbByNumericId(tmdbKey, tmdbId) {
  if (!tmdbKey || !tmdbId) return null;
  const id = parseInt(String(tmdbId), 10);
  if (!id) return null;

  for (const type of ['movie', 'tv']) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${tmdbKey}`);
      const data = await res.json();
      if (data.success === false) continue;

      const extRes = await fetch(
        `https://api.themoviedb.org/3/${type}/${id}/external_ids?api_key=${tmdbKey}`,
      );
      const ext = await extRes.json();

      const result = {
        title: data.title || data.name || 'Unknown',
        year: (data.release_date || data.first_air_date || '').slice(0, 4),
        imdbId: ext.imdb_id || null,
        tmdbId: data.id,
        type: type === 'tv' ? 'tv' : 'movie',
        poster: data.poster_path ? `https://image.tmdb.org/t/p/w780${data.poster_path}` : null,
        backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
        plot: data.overview || '',
        genre: (data.genres || []).map((g) => g.name).join(', '),
      };

      if (type === 'tv') {
        const tvInfo = await getTmdbTvSeasons(tmdbKey, id);
        if (tvInfo) result.seasons = tvInfo.seasons;
        if (!result.poster && tvInfo?.poster) result.poster = tvInfo.poster;
      }

      return result;
    } catch {
      /* try next type */
    }
  }
  return null;
}

export async function enrichPoster(tmdbKey, movie, omdbKey = '') {
  const { resolveImages } = await import('./imageService.js');
  return resolveImages(movie, { tmdbKey, omdbKey });
}

export async function enrichMoviesPosters(tmdbKey, movies, limit = 20) {
  const out = [];
  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    if (i < limit && (!m.poster || m.poster === 'N/A')) {
      out.push(await enrichPoster(tmdbKey, m));
    } else {
      out.push(m.poster ? m : { ...m, poster: PLACEHOLDER, backdrop: PLACEHOLDER });
    }
  }
  return out;
}

function hasRealPoster(movie) {
  const p = movie?.poster;
  return p && p !== 'N/A' && p !== PLACEHOLDER && !String(p).includes('photo-1489599849927');
}

function parseYear(movie) {
  const y = parseInt(String(movie?.year || '').slice(0, 4), 10);
  return Number.isNaN(y) ? 0 : y;
}

function recencyBoost(movie, query) {
  const year = parseYear(movie);
  if (!year) return 0;
  const q = query.toLowerCase().trim();
  const currentYear = new Date().getFullYear();
  if (/^(latest|new|recent|newest)$/.test(q)) {
    return Math.max(0, (year - (currentYear - 4)) * 5);
  }
  if (/^20(2[4-9]|[3-9]\d)$/.test(q) && String(year) === q) {
    return 20;
  }
  if (year >= currentYear - 1) return 4;
  if (movie.recent) return 6;
  return 0;
}

function mergeMovieFields(a, b) {
  if (!a) return b;
  if (!b) return a;
  const pickPoster = hasRealPoster(b) ? b.poster : (hasRealPoster(a) ? a.poster : b.poster || a.poster);
  const pickBackdrop = b.backdrop && b.backdrop !== PLACEHOLDER ? b.backdrop : a.backdrop;
  return {
    ...a,
    ...b,
    title: b.title || a.title,
    year: b.year || a.year,
    imdbId: b.imdbId || a.imdbId,
    tmdbId: b.tmdbId || a.tmdbId,
    type: b.type || a.type,
    poster: pickPoster,
    backdrop: pickBackdrop,
    plot: (b.plot?.length || 0) > (a.plot?.length || 0) ? b.plot : a.plot,
    genre: b.genre || a.genre,
    rating: b.rating || a.rating,
    recent: a.recent || b.recent,
  };
}

export function searchLocalCatalog(catalog, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  if (/^(latest|new|recent|newest)$/.test(q)) {
    return catalog
      .filter((m) => m.recent || parseYear(m) >= new Date().getFullYear() - 2)
      .sort((a, b) => parseYear(b) - parseYear(a))
      .map((m) => ({ ...m, _score: 90 + recencyBoost(m, q) }));
  }

  const yearMatch = q.match(/^20(2[4-9]|[3-9]\d)$/);
  if (yearMatch) {
    return catalog
      .filter((m) => String(m.year || '').startsWith(q))
      .sort((a, b) => parseYear(b) - parseYear(a))
      .map((m) => ({ ...m, _score: 85 + recencyBoost(m, q) }));
  }

  return catalog
    .filter((m) => fuzzyLocalMatch(m.title, q) || (m.genre && m.genre.toLowerCase().includes(q)))
    .map((m) => ({ ...m, _score: relevanceScore(m.title, q) + 10 + recencyBoost(m, q) }))
    .sort((a, b) => b._score - a._score);
}

export function mergeSearchResults(local, remote, query) {
  const ranked = new Map();

  for (const m of [...local, ...remote]) {
    if (!m?.imdbId) continue;
    const score = (m._score ?? relevanceScore(m.title, query)) + recencyBoost(m, query);
    const prev = ranked.get(m.imdbId);
    if (!prev) {
      ranked.set(m.imdbId, { item: m, score });
    } else {
      ranked.set(m.imdbId, {
        item: mergeMovieFields(prev.item, m),
        score: Math.max(prev.score, score),
      });
    }
  }

  return [...ranked.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => {
      const { _score, ...rest } = item;
      return rest;
    });
}

export { PLACEHOLDER };
