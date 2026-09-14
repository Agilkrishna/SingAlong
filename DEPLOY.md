# 🚀 Deploying DesiHangout for Free

DesiHangout is **3 moving parts in 1 container**:

| Part | What it does | Internal port |
|------|--------------|---------------|
| **Next.js standalone** | UI + REST APIs (YouTube search, points, leaderboard) | 3000 |
| **Realtime service** (Bun + socket.io) | Rooms, chat, WebRTC signaling, karaoke sync, stage points | 3003 |
| **Edge proxy** (Bun, `docker/edge-proxy.js`) | One public port → routes HTTP + relays WebSocket upgrades | `$PORT` |

The included `Dockerfile` runs all three, so any Docker host with **one open port** can serve the whole app. The edge proxy is pure Bun with **zero external binaries** — hardened platforms (Render) refuse to exec executables carrying file capabilities (e.g. the official Caddy image's binary), so the image only ever runs Bun, which every one of these platforms supports. Video/audio between singers is **peer-to-peer (WebRTC)** — the server only handles signaling, so a free tiny instance is enough.

---

## 🆚 Free-host comparison at a glance

| Host | Sleeps when idle | Wake-up delay | Branded loading page? | Credit card |
|------|------------------|---------------|------------------------|-------------|
| **Render** (free) | after **15 min** | ~50–60 s | **Yes — Render "waking up" splash** | No |
| **~~Koyeb~~** ⚠️ | ~~after 1 h~~ | — | — | — |
| **HF Spaces** (free) | after **48 h** | 1–3 min | **No** — your own app just loads | No |
| **Cloud Run** (free tier) | scales to zero | ~10 s | No | Yes |
| **Fly.io** / **Oracle Always Free** | never | — | — | Yes |

> ⚠️ **Koyeb is no longer an option** — Mistral AI acquired it (Feb 2026) and the platform now only serves AI workloads; new web-service deploys are closed.
> While someone is inside a room, **WebSocket traffic keeps all of these awake** — sleeping only ever hits the *first* visitor after idle time.

## ✅ Option A — Render.com (recommended, free)

1. Push this repo to **GitHub**.
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → select the repo (it auto-detects `render.yaml`) → **Apply**.
   *(Or: **New → Web Service** → connect repo → Runtime **Docker**.)*
3. (Optional but recommended) Add env var `YOUTUBE_API_KEY` — see [YouTube search](#-youtube-search-scrape-vs-api-key) below.
4. Wait for the build (~5–8 min). Your app goes live at `https://<name>.onrender.com`.

**Free-tier behavior & fixes**
- Sleeps after ~15 min without HTTP traffic; waking takes ~50 s. The first singer of the day should reload once if the socket doesn't connect immediately.
- **Keep it always awake** with a free cron ping: create a monitor at [cron-job.org](https://cron-job.org) hitting `https://<name>.onrender.com/api` every 10 min (750 free hrs/month covers 24/7).
- SQLite = ephemeral disk → **leaderboard resets on redeploys** (it survives ordinary restarts). See [Persistence](#-saving-the-leaderboard-permanently).

## ☁️ Option B — ~~Koyeb~~ (CLOSED — acquired by Mistral AI, Feb 2026)

Koyeb joined Mistral AI to build AI infrastructure; the dashboard no longer offers web-service deploys to new users. **Use Option A (Render + keep-alive ping) or Option C (HF Spaces) instead.**

## 🤗 Option C — Hugging Face Spaces (free, no credit card at all)

1. Create a **Space** → SDK: **Docker** → push this repo (Space secret: `YOUTUBE_API_KEY` optional).
2. Spaces require the app on port **7860** → set Space variable `PORT=7860`.
3. Free CPU container runs it; sleeps after ~48 h of inactivity (a cron ping also prevents this).

## ☁️ Option C2 — Google Cloud Run (free tier, card required)

1. `gcloud run deploy desihangout --source . --allow-unauthenticated` (it builds the Dockerfile).
2. Set port to **10000** (`--port 10000`), min-instances 0.
3. **No splash page and ~10 s cold start**, plus 2 M requests/month free — but open **WebSockets bill vCPU-seconds continuously**, so a multi-hour room can exhaust the 180 k free vCPU-s faster than the others. Best for light/sporadic jam sessions.

## 🐳 Option D — Fly.io (not free anymore, but ~$2–3/mo, persistent disk)

```bash
fly launch --dockerfile Dockerfile --now    # then:
fly volumes create singdata --size 1        # mount at /app/db → SQLite survives redeploys
fly deploy
```

## 🖥️ Option E — Oracle Cloud "Always Free" (genuinely free VPS, full control)

Oracle's Always Free ARM VM (4 cores / 24 GB RAM) is the most powerful truly-free option:

```bash
sudo apt install docker.io caddy
git clone <your-repo> && cd desihangout
sudo docker build -t desihangout .
sudo docker run -d --name desihangout --restart unless-stopped \
  -p 127.0.0.1:3001:10000 -v /opt/desihangout/db:/app/db desihangout
# host Caddy (or the included config pattern) terminates HTTPS on 80/443:
#   desihangout.yourdomain.com → reverse_proxy 127.0.0.1:3001
```

Because the SQLite file lives in `/opt/desihangout/db` on the VM, **nothing ever resets**.

---

## 🔊 YouTube search: scrape vs API key

| Mode | When | Notes |
|------|------|-------|
| **Keyless scrape** (default) | No env var | Zero setup. YouTube sometimes bot-checks **datacenter IPs** (Render/Koyeb) — if search returns errors, switch to the API. |
| **`YOUTUBE_API_KEY`** | Set the env var | Official Data API v3. Free quota ≈ **100 searches/day**, takes 2 min: [console.cloud.google.com](https://console.cloud.google.com) → new project → enable **YouTube Data API v3** → API key. |

Playback itself always happens **in each singer's browser**, so YouTube embeds play fine regardless of server IP.

## 💾 Saving the leaderboard permanently

Free tiers use an **ephemeral disk** — the `SingerScore` table (popper/heart points) resets on redeploys. Choose one:

1. **Live with it** (fine for casual jamming).
2. **Fly.io volume** or **Oracle VM** → file persists (Options D/E above).
3. **Turso** (free hosted SQLite): `turso db create` → set `DATABASE_URL=libsql://…` + `DATABASE_AUTH_TOKEN`… requires swapping Prisma's sqlite provider to the `@prisma/adapter-libsql` driver adapter (small code change).
4. **Render persistent disk** (paid, ~$1–2/mo) → mount at `/app/db`.

## 🌐 WebRTC notes (important for voice/video)

- Media flows **peer-to-peer**; the server only signals, so free-tier specs are plenty.
- **STUN** (Google, free) is preconfigured and works on most home/wifi networks.
- Some **mobile-carrier CGNATs** need a TURN relay. The app supports one via build-time env vars:
  `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL`.
  Free/metered TURN: [Open Relay](https://www.metered.ca/tools/openrelay/) (`openrelay.metered.ca:80` user `openrelayproject` cred `openrelayproject`) — community service, add your own (Cloudflare Calls TURN / coturn on a VM) for production reliability.

## 🔒 Security checklist (before inviting the internet)

- The realtime service currently allows `CORS: *` and any name — perfect for friends & community jam rooms; add rate limiting / moderation before a public launch.
- Set `YOUTUBE_API_KEY` as a **secret**, never commit it.
- Render/Koyeb/HF all give you **HTTPS automatically** — required for camera & mic permissions.

## 🧰 Local production smoke test (no Docker needed)

```bash
bun install && bun run build
DATABASE_URL=file:$PWD/db/custom.db PORT=3100 HOSTNAME=127.0.0.1 bun .next/standalone/server.js &
bun mini-services/anthakshari-service/index.ts &
PORT=8099 bun docker/edge-proxy.js &
open http://localhost:8099
```

Quick checks: `curl -s localhost:8099/api/leaderboard` → JSON; the room's
top-right signal icon turns **green** (WebSocket upgrade relayed correctly).
