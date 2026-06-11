import { motion } from 'framer-motion';
import { getPoster, PLACEHOLDER } from '../utils/api';

export default function MovieCard({
  movie,
  onPlay,
  onInfo,
  onHoverPreload,
  index = 0,
  variant = 'landscape',
  rank,
  showRecent,
  episodeLabel,
}) {
  const title = movie.title || movie.Title || 'Unknown';
  const poster = getPoster(movie);
  const match = movie.rating ? `${Math.round(parseFloat(movie.rating) * 10)}% match` : null;
  const isPortrait = variant === 'portrait' || variant === 'top10';

  return (
    <motion.div
      className={`movie-card-wrap${isPortrait ? ' portrait' : ''}${variant === 'top10' ? ' top10' : ''}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.35 }}
      whileHover={{ y: -4 }}
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
          onError={(e) => {
            e.target.src = PLACEHOLDER;
          }}
        />
        {episodeLabel && <span className="card-ep-badge">{episodeLabel}</span>}
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
