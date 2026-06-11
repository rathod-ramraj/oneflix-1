import { useRef } from 'react';
import MovieCard from './MovieCard';

export default function MovieRow({
  title,
  movies,
  loading,
  onPlay,
  onInfo,
  onHoverPreload,
  variant = 'landscape',
  exploreLink,
}) {
  const trackRef = useRef(null);

  const scroll = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (variant === 'top10' ? 280 : 320), behavior: 'smooth' });
  };

  return (
    <section className={`row-section${variant === 'top10' ? ' row-top10' : ''}`}>
      <div className="row-header">
        <h2 className="row-title">{title}</h2>
        {exploreLink && <button type="button" className="row-explore">Explore All ›</button>}
      </div>
      <div className="row-carousel">
        <button type="button" className="row-arrow left" onClick={() => scroll(-1)} aria-label="Previous">
          ‹
        </button>
        <div className={`row-track${variant === 'top10' ? ' top10' : ''}`} ref={trackRef}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`movie-card skeleton${variant === 'top10' ? ' portrait' : ''}`} />
              ))
            : movies.map((movie, i) => (
                <MovieCard
                  key={movie.imdbId || movie.title}
                  movie={movie}
                  index={i}
                  variant={variant}
                  rank={variant === 'top10' ? i + 1 : undefined}
                  showRecent={variant === 'top10'}
                  episodeLabel={movie.episodeLabel}
                  onPlay={onPlay}
                  onInfo={onInfo}
                  onHoverPreload={onHoverPreload}
                />
              ))}
        </div>
        <button type="button" className="row-arrow right" onClick={() => scroll(1)} aria-label="Next">
          ›
        </button>
      </div>
    </section>
  );
}
