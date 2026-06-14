export function buildClientRows(movies) {
  if (!Array.isArray(movies) || !movies.length) {
    return { hero: null, heroes: [], rows: [] };
  }
  const featureFilms = movies.filter((m) => m.type === 'movie' && m.poster);
  const tvShows = movies.filter((m) => m.type === 'tv' && m.poster);
  const recent = movies.filter((m) => m.recent && m.poster);
  const hero = movies.find((m) => m.featured) || movies[0];
  const heroes = (recent.length ? recent : movies).slice(0, 12);
  const rows = [
    { id: 'trending', title: 'Trending Now', movies: featureFilms.slice(0, 12) },
    { id: 'tv', title: 'Popular TV Shows', movies: tvShows.slice(0, 12) },
    { id: 'recent', title: 'Recently Added', movies: (recent.length ? recent : featureFilms).slice(0, 10) },
    {
      id: 'top10',
      title: 'Top 10 Movies Today',
      variant: 'top10',
      movies: [...featureFilms]
        .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
        .slice(0, 8),
    },
  ].filter((r) => r.movies.length);
  return { hero, heroes, rows };
}
