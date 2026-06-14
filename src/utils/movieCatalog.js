import catalog from '../../backend/movies.json';

const byId = new Map(catalog.filter((m) => m.imdbId).map((m) => [m.imdbId, m]));

export { catalog };

export function getMovieFromCatalog(id) {
  if (!id) return null;
  return byId.get(String(id)) || null;
}
