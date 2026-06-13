const MY_LIST_KEY = 'oneflix_mylist_v1';

function movieKey(movie) {
  return movie?.imdbId || (movie?.tmdbId != null ? String(movie.tmdbId) : null);
}

export function getMyList() {
  try {
    return JSON.parse(localStorage.getItem(MY_LIST_KEY) || '[]');
  } catch {
    return [];
  }
}

export function isInMyList(movie) {
  const key = movieKey(movie);
  if (!key) return false;
  return getMyList().some((m) => movieKey(m) === key);
}

export function addToMyList(movie) {
  const key = movieKey(movie);
  if (!key) return getMyList();
  const list = getMyList().filter((m) => movieKey(m) !== key);
  list.unshift(movie);
  localStorage.setItem(MY_LIST_KEY, JSON.stringify(list));
  return list;
}

export function removeFromMyList(movie) {
  const key = movieKey(movie);
  if (!key) return getMyList();
  const list = getMyList().filter((m) => movieKey(m) !== key);
  localStorage.setItem(MY_LIST_KEY, JSON.stringify(list));
  return list;
}

export function toggleMyList(movie) {
  return isInMyList(movie) ? removeFromMyList(movie) : addToMyList(movie);
}
