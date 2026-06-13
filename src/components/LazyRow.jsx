import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { lazyReveal } from '../utils/motion';

export default function LazyRow({ children, minHeight = 220 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const show = () => setVisible(true);
    const fallback = setTimeout(show, 2500);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          show();
          io.disconnect();
        }
      },
      { rootMargin: '500px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => {
      clearTimeout(fallback);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className="lazy-row-slot" style={{ minHeight: visible ? undefined : minHeight }}>
      {visible ? (
        <motion.div {...lazyReveal(reduced)}>{children}</motion.div>
      ) : null}
    </div>
  );
}
