import { useEffect, useRef } from 'react';

/**
 * Tracks mouse position and creates a subtle glow/lighting
 * effect that follows the cursor across the page.
 */
export function useMouseGlow() {
  const glowRef = useRef(null);

  useEffect(() => {
    const glow = document.createElement('div');
    glow.style.cssText = `
      position: fixed;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(229,9,20,0.06) 0%, transparent 70%);
      pointer-events: none;
      z-index: 2;
      transform: translate(-50%, -50%);
      transition: left 0.8s ease, top 0.8s ease;
      will-change: left, top;
    `;
    document.body.appendChild(glow);
    glowRef.current = glow;

    const onMove = (e) => {
      glow.style.left = e.clientX + 'px';
      glow.style.top  = e.clientY + 'px';
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (glowRef.current) document.body.removeChild(glowRef.current);
    };
  }, []);
}

/**
 * Returns { x, y } of mouse position (0–1 normalized per element)
 * for use in tilt/parallax effects.
 */
export function useCardTilt(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onEnter = (e) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width  - 0.5) * 12;
      const y = ((e.clientY - rect.top)  / rect.height - 0.5) * -12;
      el.style.transform = `perspective(600px) rotateY(${x}deg) rotateX(${y}deg) scale(1.03)`;
    };
    const onLeave = () => {
      el.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg) scale(1)';
    };

    el.addEventListener('mousemove', onEnter);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onEnter);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [ref]);
}
