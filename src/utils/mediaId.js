/** Parse tt…, numeric TMDB, or IMDb/TMDB URLs (mirrors backend/streamProviders.js) */
export function parseMediaId(raw) {
  const s = (raw || '').trim();
  if (!s) return null;

  const imdbUrl = s.match(/imdb\.com\/title\/(tt\d{7,8})/i);
  if (imdbUrl) return { id: imdbUrl[1].toLowerCase(), kind: 'imdb' };

  const tmdbMovie = s.match(/themoviedb\.org\/movie\/(\d+)/i);
  if (tmdbMovie) return { id: tmdbMovie[1], kind: 'tmdb', type: 'movie' };

  const tmdbTv = s.match(/themoviedb\.org\/tv\/(\d+)/i);
  if (tmdbTv) return { id: tmdbTv[1], kind: 'tmdb', type: 'tv' };

  if (/^tt\d{7,8}$/i.test(s)) return { id: s.toLowerCase(), kind: 'imdb' };
  if (/^\d+$/.test(s)) return { id: s, kind: 'tmdb' };

  return null;
}

/** @deprecated use parseMediaId */
export function parseImdbId(raw) {
  const parsed = parseMediaId(raw);
  return parsed?.kind === 'imdb' ? parsed.id : null;
}
