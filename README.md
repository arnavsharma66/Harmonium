# Harmonium

> Your YouTube Music, beautifully played.

Harmonium is a music player that wraps your YouTube library in a clean, Spotify-inspired interface. Sign in with Google once — your playlists, liked songs, and watch history load automatically. No API keys, no setup, no cost to you.

![Harmonium](https://img.shields.io/badge/status-live-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

**Live:** [harmoniummusic.vercel.app](https://harmoniummusic.vercel.app)

---

## What it does

- **Plays your YouTube library** — playlists, liked songs, search, all in one place
- **Music-only filter** — hides videos over 20 minutes so only actual music shows up
- **Synced lyrics** — fetches time-synced lyrics from LRCLIB, scrolls automatically
- **Fullscreen player** — Apple Music-style view with ambient blurred background and lyrics on the right
- **Home screen** — Spotify-style grid with most played, recently liked, daily mix, and artist rows
- **Queue** — add tracks, reorder, clear
- **Keyboard shortcuts** — Space, N, P, S, R, M, F, Escape, arrow keys

---

## How it works

The quota trick is the interesting part. Instead of the developer burning through YouTube API quota, **each user authenticates with their own Google account**. Their API calls are charged to their own quota (10,000 units/day free). Developer quota used: zero.

```
User → Google OAuth → access token → Flask backend → YouTube Data API v3
                                   ↑
                          token stored in memory
                          UUID session token returned to frontend
```

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla HTML/CSS/JS |
| Backend | Python Flask |
| Auth | Google OAuth 2.0 |
| Music API | YouTube Data API v3 + IFrame API |
| Lyrics | LRCLIB (free, no key needed) |
| Frontend deploy | Vercel |
| Backend deploy | Render |

---

## Running locally

### Prerequisites
- Python 3.10+
- A Google Cloud project with YouTube Data API v3 enabled
- OAuth 2.0 Web Application credentials

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file:
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
SECRET_KEY=any_random_string
FRONTEND_URL=http://localhost:5500
```

Add `http://localhost:5000/auth/callback` to your OAuth redirect URIs in Google Cloud Console.

```bash
python app.py
```

### Frontend

Just open `frontend/index.html` in a browser, or serve it:

```bash
cd frontend
npx serve .
```

---

## Project structure

```
Harmonium/
├── frontend/
│   └── index.html          # Entire frontend — one file
├── backend/
│   ├── app.py              # Flask server
│   ├── requirements.txt
│   └── render.yaml         # Render deploy config
└── README.md
```

---

## API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /auth/login` | Redirect to Google OAuth |
| `GET /auth/callback` | OAuth callback, returns session token |
| `GET /auth/me` | Get current user info |
| `POST /auth/logout` | Invalidate session token |
| `GET /api/playlists` | User's playlists |
| `GET /api/playlist-items` | Items in a playlist |
| `GET /api/videos` | Video details by ID |
| `GET /api/liked` | Liked videos |
| `GET /api/history` | Recent activity |
| `GET /api/search` | Search YouTube |
| `GET /health` | Health check |

All endpoints except `/auth/login`, `/auth/callback`, and `/health` require `Authorization: Bearer <token>`.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `N` | Next track |
| `P` | Previous track |
| `S` | Toggle shuffle |
| `R` | Toggle repeat |
| `M` | Mute / Unmute |
| `F` | Open / close fullscreen |
| `→` | Seek forward 10s |
| `←` | Seek back 10s |
| `Escape` | Close fullscreen |

---

## Deploying your own

### Backend → Render

1. Push to GitHub
2. New Web Service on Render, connect repo, set root to `backend/`
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`
5. Add environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FRONTEND_URL`

### Frontend → Vercel

1. New project on Vercel, connect repo
2. Set root directory to `frontend/`
3. No build step needed — it's static HTML

---

## Known limitations

- **Render free tier cold starts** — backend sleeps after 15 min inactivity, first request takes ~30s
- **Watch history** — YouTube's Activities API doesn't expose full watch history, so this shows recently liked videos as a proxy
- **Music detection** — uses video duration to filter (>20 min = likely not music), not perfect

---

## Built by

[Arnav Sharma](https://arnavsharma.cv) — [GitHub](https://github.com/arnavsharma66)
