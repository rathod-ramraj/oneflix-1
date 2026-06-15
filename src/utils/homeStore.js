import { fetchRows, fetchAllMovies, resetRowsCache, syncRowsCache } from './api';
import { getOfflineHome } from './offlineHome';

const SS_KEY = 'sf_home_bootstrap_v1';
const LS_KEY = 'sf_home_bootstrap_v1';

let memory = null;
let inflight = null;
let frozen = false;
let bootAttempted = false;

function slimMovie(m) {
  if (!m) return null;
  return {
    imdbId: m.imdbId,
    tmdbId: m.tmdbId,
    title: m.title,
    year: m.year,
    poster: m.poster,
    backdrop: m.backdrop,
    type: m.type,
    rating: m.rating,
    genre: m.genre,
    plot: m.plot ? String(m.plot).slice(0, 280) : m.plot,
    runtime: m.runtime,
    recent: m.recent,
    featured: m.featured,
    seasons: m.seasons,
  };
}

function slimHomePayload(data) {
  if (!data?.rows?.length) return data;
  return {
    hero: slimMovie(data.hero),
    heroes: (data.heroes || []).map(slimMovie).filter(Boolean),
    rows: data.rows.map((row) => ({
      id: row.id,
      title: row.title,
      variant: row.variant,
      explore: row.explore,
      movies: (row.movies || []).map(slimMovie).filter(Boolean),
    })),
  };
}

function readStorage() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.rows?.length) return data;
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.rows?.length) return data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeStorage(raw) {
  try {
    sessionStorage.setItem(SS_KEY, raw);
  } catch {
    /* quota */
  }
  try {
    localStorage.setItem(LS_KEY, raw);
  } catch {
    /* quota — session only */
  }
}

/** Persist home catalog — slim payload so localStorage survives reload */
export function persistHomeSnapshot(data) {
  if (!data?.rows?.length) return;
  const slim = slimHomePayload(data);
  memory = slim;
  frozen = true;
  bootAttempted = true;
  syncRowsCache(slim);
  writeStorage(JSON.stringify(slim));
}

/** Sync read — storage → offline catalog (always instant) */
export function getHomeData() {
  if (memory?.rows?.length) return memory;
  const stored = readStorage();
  if (stored) {
    memory = stored;
    frozen = true;
    bootAttempted = true;
    syncRowsCache(stored);
    return memory;
  }
  const offline = getOfflineHome();
  if (offline?.rows?.length) {
    memory = offline;
    syncRowsCache(offline);
  }
  return memory;
}

export function seedHomeIfNeeded(data) {
  if (!data?.rows?.length || frozen) return;
  persistHomeSnapshot(data);
}

export function isHomeReady() {
  getHomeData();
  return frozen && Boolean(memory?.rows?.length);
}

export function isHomeFrozen() {
  getHomeData();
  return frozen;
}

export function hasBootAttempted() {
  return bootAttempted || frozen;
}

export function clearBootAttempted() {
  if (frozen) return;
  bootAttempted = false;
  inflight = null;
}

/** Fetch home catalog once — never refetches after success */
export function loadHomeOnce({ fresh = false } = {}) {
  getHomeData();
  if (!fresh && frozen && memory?.rows?.length) return Promise.resolve(memory);
  if (inflight) return inflight;

  bootAttempted = true;

  inflight = fetchRows({ fresh })
    .then((data) => {
      if (data?.rows?.length) persistHomeSnapshot(data);
      return data;
    })
    .catch((err) => {
      inflight = null;
      if (!frozen) bootAttempted = false;
      const offline = getOfflineHome();
      if (offline?.rows?.length) return offline;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Manual retry only */
export function resetHomeBootstrap() {
  frozen = false;
  memory = null;
  inflight = null;
  bootAttempted = false;
  resetRowsCache();
  try {
    sessionStorage.removeItem(SS_KEY);
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

/** Fire catalog fetch as early as possible */
export function warmHomeCache() {
  if (typeof window === 'undefined') return;
  if (isHomeReady()) {
    fetchAllMovies().catch(() => {});
    return;
  }
  loadHomeOnce()
    .then(() => fetchAllMovies().catch(() => {}))
    .catch(() => {});
}

warmHomeCache();
