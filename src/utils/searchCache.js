/** In-memory + localStorage search cache for instant repeat lookups */

const LS_KEY = 'sf_search_v1';
const MAX_MEMORY = 80;
const MAX_LS = 40;
const DEFAULT_TTL = 1000 * 60 * 30;

const memory = new Map();

function readLs() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLs(data) {
  try {
    const keys = Object.keys(data).sort((a, b) => (data[b].at || 0) - (data[a].at || 0));
    const trimmed = {};
    keys.slice(0, MAX_LS).forEach((k) => { trimmed[k] = data[k]; });
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  } catch { /* quota */ }
}

function normalizeKey(query) {
  return query.trim().toLowerCase();
}

export function getSearchCache(query, maxAge = DEFAULT_TTL) {
  const key = normalizeKey(query);
  if (!key) return null;

  const mem = memory.get(key);
  if (mem && Date.now() - mem.at < maxAge) return mem.data;

  const ls = readLs()[key];
  if (ls && Date.now() - ls.at < maxAge) {
    memory.set(key, ls);
    return ls.data;
  }
  return null;
}

export function setSearchCache(query, data) {
  const key = normalizeKey(query);
  if (!key) return;

  const entry = { data, at: Date.now() };
  memory.set(key, entry);

  if (memory.size > MAX_MEMORY) {
    const oldest = [...memory.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) memory.delete(oldest);
  }

  const ls = readLs();
  ls[key] = entry;
  writeLs(ls);
}

/** Prefix match for instant suggestions while typing */
export function getSearchSuggestions(prefix, limit = 8) {
  const p = normalizeKey(prefix);
  if (p.length < 2) return [];

  const fromMem = [...memory.entries()]
    .filter(([k]) => k.startsWith(p))
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, limit)
    .flatMap(([, v]) => v.data.results?.slice(0, 3) || []);

  const ls = readLs();
  const fromLs = Object.entries(ls)
    .filter(([k]) => k.startsWith(p))
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, limit)
    .flatMap(([, v]) => v.data.results?.slice(0, 3) || []);

  const seen = new Set();
  return [...fromMem, ...fromLs].filter((m) => {
    if (!m?.imdbId || seen.has(m.imdbId)) return false;
    seen.add(m.imdbId);
    return true;
  }).slice(0, limit);
}

export const POPULAR_SEARCHES = ['batman', 'marvel', 'stranger things', 'breaking bad', 'avatar'];
