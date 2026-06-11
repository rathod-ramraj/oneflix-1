import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Loader({ onDone }) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Animate progress bar
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(interval); return 100; }
        return p + Math.random() * 18;
      });
    }, 120);

    const timer = setTimeout(() => {
      setDone(true);
      setTimeout(onDone, 600);
    }, 2000);

    return () => { clearInterval(interval); clearTimeout(timer); };
  }, [onDone]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="loader"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            position: 'fixed', inset: 0, background: 'var(--bg)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 9000,
          }}
        >
          {/* Animated logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] }}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(3rem, 8vw, 5.5rem)',
              color: 'var(--red)', letterSpacing: '8px',
              marginBottom: '2.5rem',
            }}
          >
            <motion.span
              animate={{
                textShadow: [
                  '0 0 20px rgba(229,9,20,0.3)',
                  '0 0 60px rgba(229,9,20,0.8)',
                  '0 0 20px rgba(229,9,20,0.3)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              STREAMFLIX
            </motion.span>
          </motion.div>

          {/* Progress bar */}
          <div style={{
            width: 200, height: 2.5,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 4, overflow: 'hidden',
          }}>
            <motion.div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, var(--red), var(--red2))',
                borderRadius: 4,
                boxShadow: '0 0 12px rgba(229,9,20,0.6)',
              }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.15 }}
            />
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 0.5 }}
            style={{
              marginTop: '1.5rem', fontSize: '0.72rem',
              color: 'var(--txt2)', letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            Loading your experience
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
