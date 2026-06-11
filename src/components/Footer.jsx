import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';

const LINKS = ['About', 'Privacy Policy', 'Terms of Service', 'Support'];

export default function Footer() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <motion.footer
      ref={ref}
      className="site-footer glass-dark"
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <h2 className="footer-heading">Stream movies, TV shows, live TV & more.</h2>

      <div className="footer-links">
        {LINKS.map((label, i) => (
          <motion.button
            key={label}
            type="button"
            className="footer-pill"
            whileHover={{ scale: 1.04, backgroundColor: 'rgba(255,255,255,0.12)' }}
            whileTap={{ scale: 0.97 }}
            initial={{ opacity: 0, y: 8 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.06 }}
          >
            {label.toUpperCase()}
          </motion.button>
        ))}
      </div>

      <p className="footer-copy">
        © {new Date().getFullYear()} ONEFLIX. All rights reserved. This site does not host any streams;
        it provides links to content on third-party sites.
      </p>
    </motion.footer>
  );
}
