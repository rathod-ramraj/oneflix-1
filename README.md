# StreamApp — Netflix-Style OTT Platform

A full-stack movie streaming web app with a **glassmorphism** UI, local movie catalog, multi-provider embed playback, and an Express backend proxy for restricted networks (e.g. college Wi‑Fi).

---

## Features

- **Home** — Hero banner, trending rows, continue watching
- **Search** — Live search against local `movies.json` via backend
- **Player** — iframe embeds with 4 provider fallbacks, server switcher, TV season/episode picker
- **Glassmorphism UI** — Floating pill nav, blurred panels, landscape 16:9 cards
- **No blocked APIs in frontend** — All data flows through Express (`/api/*`)
- **Watch progress** — `postMessage` + `localStorage` for continue watching
- **Hover preload** — Hidden iframe warms first stream provider on card hover

---

## Project Structure

```
streamapp/
├── backend/
│   ├── server.js          # Express API + static serve (production)
│   └── movies.json        # Local movie/TV catalog
├── src/
│   ├── App.jsx            # Routes: home, search, player
│   ├── index.css          # Glassmorphism design system
│   ├── components/        # Navbar, Hero, MovieRow, Player, etc.
│   └── utils/
│       ├── api.js         # Backend fetch + localStorage cache
│       └── stream.js      # Provider URLs + embed proxy helper
├── index.html
├── vite.config.js         # Dev proxy → backend :3001
└── package.json
```

---

## Environment Variables

Copy `.env` and set:

```env
PORT=3001
TMDB_API_KEY=your_tmdb_key      # TV episode lists (optional but recommended)
OMDB_API_KEY=your_omdb_key      # Extra cast/metadata via backend
YOUTUBE_API_KEY=your_youtube_key
```

All keys are used **only on the backend** — never exposed to the browser.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run development (frontend + backend)

```bash
npm run dev
```

- **Frontend:** http://localhost:5173  
- **Backend API:** http://localhost:3001  

Vite proxies `/api` requests to the backend automatically.

### 3. Run backend only

```bash
npm run server
```

### 4. Production build

```bash
npm run build
npm start
```

Serves the built React app and API from `http://localhost:3001`.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search?q=` | Search movies by title/genre |
| `GET` | `/api/movies` | Full catalog |
| `GET` | `/api/movie/:id` | Single title (imdbId or tmdbId) |
| `GET` | `/api/stream/:id?season=&episode=` | Provider embed URLs |
| `GET` | `/api/rows` | Curated home page rows |
| `GET` | `/api/embed?url=` | Proxy wrapper for iframe (network bypass) |
| `GET` | `/api/health` | Health check (Render) |

---

## Stream Providers (fallback order)

1. `https://111movies.net/movie/{imdbId}` (TV: `/tv/{imdbId}/{season}/{episode}`)
2. `https://vidup.to/movie/{imdbId}?autoPlay=true`
3. `https://vidlink.pro/movie/{tmdbId}`
4. `https://player.videasy.net/movie/{tmdbId}`

The player auto-switches to the next provider after a load timeout, or you can pick a server manually.

---

## Adding Movies

Edit `backend/movies.json`:

```json
{
  "title": "Avengers: Endgame",
  "tmdbId": 299534,
  "imdbId": "tt4154796",
  "type": "movie",
  "year": "2019",
  "genre": "Action, Adventure",
  "plot": "…",
  "poster": "https://image.tmdb.org/t/p/w500/…",
  "backdrop": "https://image.tmdb.org/t/p/original/…",
  "rating": "8.4",
  "runtime": "181 min"
}
```

For TV shows, set `"type": "tv"` and add `"seasons": 5`.

Restart the backend after changes.

---

## Player Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause (postMessage to iframe) |
| `F` | Toggle fullscreen |
| `Esc` | Exit fullscreen, then close player |

---

## Deploy — Vercel (frontend) + Render (backend)

Split deployment: React on **Vercel**, Express API on **Render**.

### Architecture

```
Browser → Vercel (static React)  →  Render (Express /api/*)
          your-app.vercel.app         streamapp-api.onrender.com
```

---

### 1. Deploy backend on Render

1. Push the repo to **GitHub**.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service** → connect repo.
3. Settings:

   | Field | Value |
   |-------|--------|
   | **Root Directory** | *(leave empty)* |
   | **Runtime** | Node |
   | **Build Command** | `npm install` |
   | **Start Command** | `node backend/server.js` |
   | **Health Check Path** | `/api/health` |

4. **Environment variables** (Render → Environment):

   | Key | Value |
   |-----|--------|
   | `OMDB_API_KEY` | your OMDb key |
   | `TMDB_API_KEY` | your TMDB key |
   | `FRONTEND_URL` | `https://your-app.vercel.app` *(set after Vercel deploy)* |
   | `SERVE_STATIC` | `false` |

5. Deploy and copy your Render URL, e.g. `https://streamapp-api.onrender.com`.

**Optional:** use the included blueprint — **New** → **Blueprint** → select repo (`render.yaml`).

---

### 2. Deploy frontend on Vercel

1. [Vercel Dashboard](https://vercel.com/new) → import the same GitHub repo.
2. Framework preset: **Vite** (auto-detected from `vercel.json`).
3. **Environment variables** (Vercel → Settings → Environment Variables):

   | Key | Value |
   |-----|--------|
   | `VITE_API_URL` | `https://streamapp-api.onrender.com` *(your Render URL, no trailing slash)* |

4. Deploy. Copy your Vercel URL, e.g. `https://streamapp.vercel.app`.

---

### 3. Link frontend ↔ backend

1. In **Render**, set `FRONTEND_URL` to your Vercel URL → **Save** → redeploy.
2. In **Vercel**, confirm `VITE_API_URL` points to Render → redeploy if you changed it.

CORS allows:
- `FRONTEND_URL` exactly
- Any `https://*.vercel.app` preview deployment

---

### 4. Verify

```bash
# Backend health
curl https://YOUR-RENDER-URL.onrender.com/api/health

# Search (from browser or curl)
curl "https://YOUR-RENDER-URL.onrender.com/api/search?q=batman"
```

Open your Vercel site → Search / Play should hit the Render API.

---

### Local development (unchanged)

```bash
cp .env.example .env   # add keys
npm run dev          # Vite :5173 + API :3001, proxy /api
```

Do **not** set `VITE_API_URL` locally — Vite proxies `/api` to the backend.

---

### Single-server deploy (optional)

To serve UI + API from Render only:

```bash
npm run build
SERVE_STATIC=true npm start
```

Set `VITE_API_URL` empty and deploy `dist` via Render with `SERVE_STATIC=true`.

---


## Tech Stack

- **Frontend:** React 18, Vite  
- **Backend:** Node.js, Express, CORS  
- **Data:** Local JSON (no OMDb/TMDB calls from browser)  
- **Playback:** Third-party embed iframes via backend proxy  

---

## Removed (v2)

- Entry loader animation  
- Sign-in / sign-up flow  
- “Who’s watching?” profile picker  
- Direct OMDb / YouTube API usage in frontend  

The app opens directly on the home screen with the new glass UI.
