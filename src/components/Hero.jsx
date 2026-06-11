import { motion } from 'framer-motion';
import { getBackdrop } from '../utils/api';

export default function Hero({ movie, onPlay, onInfo }) {
  if (!movie) {
    return (
      <section className="hero">
        <div className="hero-bg skeleton" />
        <div className="hero-gradient" />
      </section>
    );
  }

  const bg = getBackdrop(movie);
  const title = movie.title || movie.Title || '';

  return (
    <section className="hero">
      <motion.div
        className="hero-bg"
        key={movie.imdbId}
        initial={{ scale: 1.06, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.9 }}
      >
        <img
          className="hero-bg-img"
          src={bg}
          alt=""
          onError={(e) => {
            const poster = movie.poster || movie.Poster;
            if (poster && e.target.src !== poster) e.target.src = poster;
          }}
        />
      </motion.div>
      <div className="hero-gradient" />
      <motion.div
        className="hero-content"
        key={`content-${movie.imdbId}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="hero-title">{title.toUpperCase()}</h1>
        <div className="hero-meta">
          {movie.year && <span>{movie.year}</span>}
          {movie.rating && <span>⭐ {movie.rating}</span>}
          {movie.runtime && <span>{movie.runtime}</span>}
          {movie.genre && <span>{movie.genre.split(',')[0]}</span>}
        </div>
        {movie.plot && <p className="hero-plot">{movie.plot}</p>}
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
      </motion.div>
      <div className="hero-bottom-bar">
        <button type="button" className="hero-mute" aria-label="Mute preview">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
          </svg>
        </button>
        <span className="hero-rating-badge">NR</span>
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
