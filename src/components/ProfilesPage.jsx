import { motion } from 'framer-motion';
import { PROFILES } from '../utils/data';

export default function ProfilesPage({ onSelect }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '2rem',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ textAlign: 'center' }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(2.2rem, 5vw, 3.4rem)',
            fontWeight: 400, marginBottom: '0.5rem',
          }}
        >
          Who's watching?
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ color: 'var(--txt2)', marginBottom: '3rem', fontSize: '0.95rem' }}
        >
          Select your profile to continue
        </motion.p>

        <div style={{ display: 'flex', gap: '1.8rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3rem' }}>
          {PROFILES.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07, ease: [0.175, 0.885, 0.32, 1.275] }}
              onClick={() => onSelect(p)}
              whileHover={{ scale: 1.09, y: -6 }}
              whileTap={{ scale: 0.96 }}
              style={{ cursor: 'pointer', textAlign: 'center' }}
            >
              <motion.div
                whileHover={{ boxShadow: `0 16px 48px rgba(0,0,0,0.55), 0 0 0 3px rgba(255,255,255,0.8)` }}
                style={{
                  width: 130, height: 130, borderRadius: 12,
                  background: p.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '3.5rem', marginBottom: '0.9rem',
                  border: '3px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
                  transition: 'box-shadow 0.3s ease',
                }}
              >
                {p.emoji}
              </motion.div>
              <p style={{ fontSize: '0.9rem', color: 'var(--txt2)', fontWeight: 500, letterSpacing: '0.3px' }}>
                {p.name}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.button
          whileHover={{ background: 'rgba(255,255,255,0.09)', borderColor: 'rgba(255,255,255,0.5)' }}
          whileTap={{ scale: 0.97 }}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.25)',
            color: 'var(--txt)', padding: '0.75rem 2.5rem',
            fontSize: '0.9rem', cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            borderRadius: 7, letterSpacing: '0.5px',
          }}
        >
          Manage Profiles
        </motion.button>
      </motion.div>
    </div>
  );
}
