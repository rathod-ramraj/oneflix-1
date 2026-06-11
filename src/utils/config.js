/**
 * API base for split deployment (Vercel frontend + Render backend).
 * Local dev: leave VITE_API_URL unset — Vite proxies /api → localhost:3001
 * Production: set VITE_API_URL=https://your-service.onrender.com (no trailing slash)
 */
const raw = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

export const API_BASE = raw;
export const API_PREFIX = raw ? `${raw}/api` : '/api';
