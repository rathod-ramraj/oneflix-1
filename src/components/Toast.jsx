import { AnimatePresence, motion } from 'framer-motion';
import { toastMotion } from '../utils/motion';

export default function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div className="toast glass-dark" {...toastMotion}>
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
