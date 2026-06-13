import { motion, useReducedMotion } from 'framer-motion';
import { getPoster, getPosterApiUrl, PLACEHOLDER } from '../utils/api';
import { cardMotion } from '../utils/motion';

export default function MovieCard({
  movie,
  onPlay,
  onInfo,
  onHoverPreload,
  index = 0,
  animate = true,
  variant = 'landscape',
  rank,
  showRecent,
  episodeLabel,
  progress,
}) {
  const reduced = useReducedMotion();
  const title = movie.title || movie.Title || 'Unknown';
  const poster = getPoster(movie);
  const match = movie.rating ? `${Math.round(parseFloat(movie.rating) * 10)}% match` : null;
  const isPortrait = variant === 'portrait' || variant === 'top10';
  const isTop10 = variant === 'top10';
  const motionProps = animate && !isTop10 ? cardMotion(index, reduced) : {};

  return (
    <motion.div
      className={`movie-card-wrap${isPortrait ? ' portrait' : ''}${isTop10 ? ' top10' : ''}`}
      {...motionProps}
    >
      {variant === 'top10' && rank != null && (
        <span className="top10-rank" aria-hidden>{rank}</span>
      )}
      <article
        className={`movie-card${isPortrait ? ' portrait' : ''}`}
        onClick={() => onInfo(movie)}
        onMouseEnter={() => onHoverPreload?.(movie)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onInfo(movie)}
      >
        <img
          src={poster}
          alt={title}
          loading="lazy"
          decoding="async"
          fetchPriority={index < 4 ? 'high' : 'low'}
          onError={(e) => {
            const img = e.target;
            const apiUrl = getPosterApiUrl(movie);
            if (apiUrl && !img.dataset.retried) {
              img.dataset.retried = '1';
              img.src = apiUrl;
              return;
            }
            if (img.src !== PLACEHOLDER) img.src = PLACEHOLDER;
          }}
        />
        {episodeLabel && <span className="card-ep-badge">{episodeLabel}</span>}
        {progress > 0 && progress < 96 && (
          <div className="card-progress-bar" aria-hidden>
            <div className="card-progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        )}
        {(showRecent || movie.recent) && <span className="card-recent-badge">Recently Added</span>}
        <div className="movie-card-hover-actions">
          <button
            type="button"
            className="btn-play-mini"
            onClick={(e) => { e.stopPropagation(); onPlay(movie); }}
            aria-label={`Play ${title}`}
          >
            ▶
          </button>
        </div>
      </article>
      {variant !== 'top10' && (
        <>
          <h3 className="movie-card-label">{title}</h3>
          <p className="movie-card-sublabel">
            {match && <span className="match">{match}</span>}
            {movie.year && <span>{movie.year}</span>}
            {movie.type === 'tv' && movie.seasons && <span>{movie.seasons} Seasons</span>}
          </p>
        </>
      )}
    </motion.div>
  );
}
