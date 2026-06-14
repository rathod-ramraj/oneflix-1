import { useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import MovieCard from './MovieCard';
import { EASE_OUT } from '../utils/motion';

export default function MovieRow({
  title,
  movies,
  onPlay,
  onInfo,
  onHoverPreload,
  variant = 'landscape',
  exploreLink,
}) {
  const trackRef = useRef(null);
  const reduced = useReducedMotion();

  const scroll = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('.movie-card-wrap');
    const step = card ? card.offsetWidth + 10 : (variant === 'top10' ? 280 : 320);
    const target = el.scrollLeft + dir * step;
    if (reduced) {
      el.scrollTo({ left: target, behavior: 'smooth' });
      return;
    }
    animate(el.scrollLeft, target, {
      duration: 0.55,
      ease: EASE_OUT,
      onUpdate: (v) => { el.scrollLeft = v; },
    });
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
        <div className={`row-track${variant === 'top10' ? ' top10' : ''}${variant === 'continue' ? ' continue' : ''}`} ref={trackRef}>
          {movies.map((movie, i) => (
                <MovieCard
                  key={movie.imdbId || movie.title}
                  movie={movie}
                  index={i}
                  animate={false}
                  variant={variant}
                  rank={variant === 'top10' ? i + 1 : undefined}
                  showRecent={variant === 'top10'}
                  episodeLabel={movie.episodeLabel}
                  progress={movie.progress}
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
