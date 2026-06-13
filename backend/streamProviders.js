/** Multi-provider embed registry — IMDb + TMDB id routing */

export const STREAM_HEX = 'ff4d6d';

const SERVERS = [
  {
    name: '111movies',
    label: '111movies — Default',
    imdb: true,
    tmdb: true,
    default: true,
    movie: 'https://111movies.net/movie/{id}',
    tv: 'https://111movies.net/tv/{id}/{season}/{episode}',
  },
  {
    name: 'peachify',
    label: 'Peachify',
    imdb: true,
    tmdb: true,
    movie: 'https://peachyyy.com/embed/movie/{id}',
    tv: 'https://peachyyy.com/embed/tv/{id}/{season}/{episode}',
  },
  {
    name: 'vidup',
    label: 'VidUp — Auto play',
    imdb: true,
    tmdb: true,
    movie: 'https://vidup.to/movie/{id}?autoPlay=true',
    tv: 'https://vidup.to/tv/{id}/{season}/{episode}?autoPlay=true',
  },
  {
    name: 'vidsrc_fyi',
    label: 'VidSrc.fyi',
    imdb: true,
    tmdb: true,
    movie: 'https://vidsrc.fyi/embed/movie/{id}',
    tv: 'https://vidsrc.fyi/embed/tv/{id}/{season}/{episode}',
  },
  {
    name: 'vidsrc_mov',
    label: 'VidSrc.mov',
    imdb: true,
    tmdb: true,
    movie: 'https://vidsrc.mov/embed/movie/{id}',
    tv: 'https://vidsrc.mov/embed/tv/{id}/{season}/{episode}',
  },
  {
    name: 'vidsrc_wtf_1',
    label: 'VidSrc.wtf — Multi Server',
    imdb: true,
    tmdb: true,
    movie: 'https://vidsrc.wtf/1/movie/{id}?color={hex}',
    tv: 'https://vidsrc.wtf/1/tv/{id}/{season}/{episode}?color={hex}',
  },
  {
    name: 'vidsrc_wtf_2',
    label: 'VidSrc.wtf — Multi Language',
    imdb: true,
    tmdb: true,
    movie: 'https://vidsrc.wtf/2/movie/{id}?color={hex}',
    tv: 'https://vidsrc.wtf/2/tv/{id}/{season}/{episode}?color={hex}',
  },
  {
    name: 'vidsrc_wtf_3',
    label: 'VidSrc.wtf — Multi Embeds',
    imdb: true,
    tmdb: true,
    movie: 'https://vidsrc.wtf/3/movie/{id}?color={hex}',
    tv: 'https://vidsrc.wtf/3/tv/{id}/{season}/{episode}?color={hex}',
  },
  {
    name: 'vidsrc_wtf_4',
    label: 'VidSrc.wtf — Premium',
    imdb: true,
    tmdb: true,
    movie: 'https://vidsrc.wtf/4/movie/{id}?color={hex}',
    tv: 'https://vidsrc.wtf/4/tv/{id}/{season}/{episode}?color={hex}',
  },
  {
    name: 'vidking',
    label: 'VidKing',
    imdb: true,
    tmdb: true,
    movie: 'https://www.vidking.net/embed/movie/{id}',
    tv: 'https://www.vidking.net/embed/tv/{id}/{season}/{episode}',
  },
  {
    name: 'vidfast',
    label: 'Vidfast — Auto play',
    imdb: true,
    tmdb: true,
    movie: 'https://vidfast.pro/movie/{id}?autoPlay=true',
    tv: 'https://vidfast.pro/tv/{id}/{season}/{episode}?autoPlay=true&nextButton=true&autoNext=true',
  },
  {
    name: 'vidcore',
    label: 'VidCore — Auto play',
    imdb: true,
    tmdb: true,
    movie: 'https://vidcore.net/movie/{id}?autoPlay=true',
    tv: 'https://vidcore.net/tv/{id}/{season}/{episode}?autoPlay=true&nextButton=true&autoNext=true',
  },
  {
    name: 'vidstorm',
    label: 'VidStorm',
    imdb: true,
    tmdb: true,
    movie: 'https://vidstorm.ru/movie/{id}',
    tv: 'https://vidstorm.ru/tv/{id}/{season}/{episode}',
  },
  {
    name: 'vidnest',
    label: 'Vidnest',
    imdb: false,
    tmdb: true,
    movie: 'https://vidnest.fun/movie/{id}',
    tv: 'https://vidnest.fun/tv/{id}/{season}/{episode}',
  },
  {
    name: 'vidlink',
    label: 'VidLink Pro',
    imdb: false,
    tmdb: true,
    movie: 'https://vidlink.pro/movie/{id}',
    tv: 'https://vidlink.pro/tv/{id}/{season}/{episode}',
  },
  {
    name: 'videasy',
    label: 'Videasy Player',
    imdb: false,
    tmdb: true,
    movie: 'https://player.videasy.net/movie/{id}',
    tv: 'https://player.videasy.net/tv/{id}/{season}/{episode}',
  },
];

function fillTemplate(template, { id, season, episode, hex }) {
  return template
    .replace(/\{id\}/g, id)
    .replace(/\{season\}/g, String(season))
    .replace(/\{episode\}/g, String(episode))
    .replace(/\{hex\}/g, hex);
}

function streamIdForServer(server, { imdbId, tmdbId }) {
  if (imdbId && server.imdb) return imdbId;
  if (tmdbId && server.tmdb) return String(tmdbId);
  return null;
}

/** Parse tt…, numeric TMDB, or IMDb/TMDB URLs */
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

export function buildStreamProviders(movie, season, episode, { hex = STREAM_HEX } = {}) {
  const { imdbId, tmdbId, type } = movie || {};
  const isTv = type === 'tv' && season && episode;

  const providers = [];
  for (const server of SERVERS) {
    const id = streamIdForServer(server, { imdbId, tmdbId });
    if (!id) continue;

    const template = isTv ? server.tv : server.movie;
    if (!template) continue;

    providers.push({
      name: server.name,
      label: server.label,
      url: fillTemplate(template, {
        id,
        season: season || 1,
        episode: episode || 1,
        hex,
      }),
    });
  }

  const defaultIdx = providers.findIndex((p) => {
    const s = SERVERS.find((x) => x.name === p.name);
    return s?.default;
  });
  if (defaultIdx > 0) {
    const [def] = providers.splice(defaultIdx, 1);
    providers.unshift(def);
  }

  return providers;
}

export const ALLOWED_EMBED_HOSTS = [
  ...new Set(
    SERVERS.flatMap((s) => [s.movie, s.tv].filter(Boolean).map((u) => new URL(u.replace(/\{[^}]+\}/g, 'x')).hostname)),
  ),
];

const PROBE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/** HEAD/GET check — false on 404, 5xx, or network error */
export async function probeProviderUrl(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const opts = {
    signal: controller.signal,
    redirect: 'follow',
    headers: { 'User-Agent': PROBE_UA },
  };
  try {
    let res = await fetch(url, { ...opts, method: 'HEAD' });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { ...opts, method: 'GET', headers: { ...opts.headers, Range: 'bytes=0-0' } });
    }
    return { ok: res.status !== 404 && res.status < 500, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export function isAllowedProviderUrl(url) {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_EMBED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
