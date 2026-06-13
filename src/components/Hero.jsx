import { motion, AnimatePresence } from 'framer-motion';
import { getBackdrop, getPosterApiUrl, PLACEHOLDER } from '../utils/api';

function heroId(movie) {
  return movie?.imdbId || movie?.imdbID || String(movie?.tmdbId ?? '');
}

export default function Hero({ movie, onPlay, onInfo }) {
  if (!movie) {
    return (
      <section className="hero">
        <div className="hero-bg skeleton" />
        <div className="hero-gradient" />
      </section>
    );
  }

  const movieId = heroId(movie);
  const title = movie.title || movie.Title || '';
  const plot = movie.plot || movie.Plot || movie.overview || '';
  const heroBg = getBackdrop(movie);
  const isTv = movie?.type === 'tv' || movie?.Type === 'series';
  const posterApi = getPosterApiUrl(movie);

  return (
    <section className="hero">
      <AnimatePresence mode="wait">
        <motion.div
          key={movieId}
          className="hero-slide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="hero-bg">
            <img
              key={movieId}
              className={`hero-bg-img${isTv ? ' hero-bg-img--tv' : ''}`}
              src={heroBg}
              alt=""
              onError={(e) => {
                const img = e.target;
                if (posterApi && !img.dataset.poster) {
                  img.dataset.poster = '1';
                  img.src = posterApi;
                  return;
                }
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
        </motion.div>
      </AnimatePresence>
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
