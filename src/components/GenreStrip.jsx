import { motion } from 'framer-motion';
import { GENRES } from '../utils/data';

export default function GenreStrip({ active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: '0.5rem',
      overflowX: 'auto', scrollbarWidth: 'none',
      paddingBottom: '0.5rem', marginBottom: '2rem',
      WebkitOverflowScrolling: 'touch',
    }}>
      <style>{`::-webkit-scrollbar { display: none; }`}</style>
      {GENRES.map((g, i) => {
        const isActive = active === g.query;
        return (
          <motion.button
            key={g.label}
            onClick={() => onChange(g.query)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            style={{
              flexShrink: 0,
              padding: '0.42rem 1.2rem',
              border: isActive
                ? '1px solid rgba(229,9,20,0.7)'
                : '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20,
              background: isActive
                ? 'rgba(229,9,20,0.2)'
                : 'rgba(255,255,255,0.04)',
              color: isActive ? '#fff' : 'var(--txt2)',
              cursor: 'pointer',
              fontSize: '0.78rem', fontWeight: 500,
              fontFamily: 'var(--font-body)',
              letterSpacing: '0.3px',
              transition: 'color 0.2s, background 0.2s, border-color 0.2s',
              backdropFilter: isActive ? 'blur(8px)' : 'none',
            }}
          >
            {g.label}
          </motion.button>
        );
      })}
    </div>
  );
}
