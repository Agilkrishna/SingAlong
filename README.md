# 🎤 SingAlong — Anonymous Antakshari Rooms

Sing (Antakshari-style!) with people from your entire State — anonymously.
Join a State room, hop on the **Main Seat**, sing along to a **YouTube karaoke
track**, and let the audience shower you with **popper 🎉 (+10)** and
**heart ❤️ (+100)** applause. Points feed the live **India leaderboard** on the
home page.

Netflix-inspired dark UI · mobile-first · fully open source (MIT).

## ✨ Features

- **Anonymous join** — no signup. Names are protected: unique per room, and
  returning visitors get their name auto-filled (stable `pid` in localStorage).
- **State rooms** — pick your State (or share your location) and join its room
  by code. No minimum members — solo practice works too.
- **Video + voice chat** — peer-to-peer WebRTC mesh (STUN included, optional
  TURN relay via env).
- **YouTube karaoke** — search in a dedicated search window, queue songs, and
  everyone in the room hears the same moment (server-timestamp sync + drift
  correction). Independent media mute/volume per listener.
- **Main Seat jam model** (no rounds/competition) — first-come singer seat;
  audience awards animated popper (+10) / heart (+100) with cooldowns; singers
  can't self-award.
- **Leaderboard** — lifetime points per anonymous name, global + per-State.

## 🧱 Stack

| Layer | Tech |
|-------|------|
| UI | Next.js 16 (App Router, standalone), React 19, Tailwind 4, shadcn/ui |
| Realtime | Bun + socket.io mini-service (`mini-services/anthakshari-service`) — rooms, chat, WebRTC signaling, karaoke sync, stage points |
| Data | SQLite via Prisma (singer scores) |
| Edge | Caddy (dev gateway + prod single-port router) |

## 🏃 Run locally

```bash
bun install
bun run db:push          # create SQLite schema
bun mini-services/anthakshari-service/index.ts   # realtime :3003
bun run dev              # app on :3000
```

> The client connects its socket to `/?XTransformPort=3003` on the same origin
> — in local dev, put any reverse proxy on your app port that forwards
> requests carrying that query param (or path `/socket.io/*`) to `:3003`.
> The repo's `Caddyfile` and `Caddyfile.prod` show working examples.

## 🚀 Deploy (free)

One container runs everything (Next.js + realtime service + Caddy on a single
port). See **[DEPLOY.md](./DEPLOY.md)** — Render free tier is the recommended
path (Blueprint included: `render.yaml`).

```bash
docker build -t singalong .
docker run -p 8080:10000 singalong   # → http://localhost:8080
```

## ⚙️ Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | ✅ (set automatically in Docker) | SQLite file, e.g. `file:/app/db/custom.db` |
| `YOUTUBE_API_KEY` | optional | Official YouTube Data API for search (free, ~100 searches/day). Without it a keyless scrape is used. |
| `NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL` | optional | TURN relay for WebRTC behind strict/symmetric NATs (set at build time) |

## 📄 License

MIT — see [LICENSE](./LICENSE).
"# SingAlong" 
