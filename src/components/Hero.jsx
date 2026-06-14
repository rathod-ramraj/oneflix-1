import { motion } from 'framer-motion';
import { getBackdrop, getBackdropApiUrl, getPosterApiUrl, markBackdropFailed, PLACEHOLDER } from '../utils/api';

export default function Hero({ movie, onPlay, onInfo }) {
  if (!movie) {
    return (
      <section className="hero">
        <div className="hero-bg hero-bg--idle" />
        <div className="hero-gradient" />
      </section>
    );
  }

  const movieId = movie?.imdbId || movie?.imdbID || String(movie?.tmdbId ?? '');
  const title = movie.title || movie.Title || '';
  const plot = movie.plot || movie.Plot || movie.overview || '';
  const heroBg = getBackdrop(movie);
  const isTv = movie?.type === 'tv' || movie?.Type === 'series';
  const backdropApi = getBackdropApiUrl(movie);
  const posterApi = getPosterApiUrl(movie);

  return (
    <section className="hero">
      <div className="hero-slide">
        <div className="hero-bg">
          <img
            className={`hero-bg-img${isTv ? ' hero-bg-img--tv' : ''}`}
            src={heroBg}
            alt=""
            onError={(e) => {
              const img = e.target;
              if (backdropApi && !img.dataset.backdrop) {
                img.dataset.backdrop = '1';
                img.src = backdropApi;
                return;
              }
              if (posterApi && !img.dataset.poster) {
                img.dataset.poster = '1';
                img.src = posterApi;
                return;
              }
              if (movieId) markBackdropFailed(movieId);
              if (img.src !== PLACEHOLDER) img.src = PLACEHOLDER;
            }}
          />
        </div>
        <div className="hero-gradient" />
        <div className="hero-content">
          <h1 className="hero-title">{title.toUpperCase()}</h1>
          <div className="hero-meta">
            {movie.year && <span>{movie.year}</span>}
            {movie.rating && <span>⭐ {movie.rating}</span>}
            {movie.runtime && <span>{movie.runtime}</span>}
            {movie.genre && <span>{movie.genre.split(',')[0]}</span>}
          </div>
          {plot && <p className="hero-plot">{plot}</p>}
          <div className="hero-actions">
            <motion.button
              type="button"
              className="btn-play"
              onClick={() => onPlay(movie)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <PlayIcon /> Play
            </motion.button>
            <motion.button
              type="button"
              className="btn-info"
              onClick={() => onInfo(movie)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <InfoIcon /> More Info
            </motion.button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 3l14 9-14 9V3z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
