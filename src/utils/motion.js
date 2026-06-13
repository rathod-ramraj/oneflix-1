export const EASE_OUT = [0.22, 1, 0.36, 1];

export const spring = { type: 'spring', damping: 28, stiffness: 340 };

export const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.28, ease: EASE_OUT },
};

export const rowReveal = (reduced) => ({
  initial: reduced ? false : { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.42, ease: EASE_OUT },
});

export const cardMotion = (index, reduced) => ({
  initial: reduced ? false : { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: {
    delay: reduced ? 0 : Math.min(index * 0.035, 0.18),
    duration: 0.32,
    ease: EASE_OUT,
  },
  whileHover: reduced ? undefined : { y: -5, transition: { duration: 0.2 } },
});

export const lazyReveal = (reduced) => ({
  initial: reduced ? false : { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.38, ease: EASE_OUT },
});

export const toastMotion = {
  initial: { opacity: 0, y: 16, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 10, scale: 0.98 },
  transition: { duration: 0.22, ease: EASE_OUT },
};
