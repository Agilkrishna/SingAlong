# syntax=docker/dockerfile:1

# ===========================================================================
# DesiHangout — all-in-one image
#   Bun edge proxy (public $PORT) → Next.js standalone (:3000)
#                                 → realtime socket.io service (:3003)
# Works on Render / Fly.io / Hugging Face Spaces / any Docker host.
# ===========================================================================

# ----------------------------- 1. dependencies ----------------------------
FROM oven/bun:1.2-debian AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# realtime mini-service resolves its own dependencies
COPY mini-services/anthakshari-service/package.json mini-services/anthakshari-service/bun.lock ./mini-services/anthakshari-service/
RUN cd mini-services/anthakshari-service && bun install --frozen-lockfile

# -------------------------------- 2. build --------------------------------
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# NOTE: no `prisma generate` / `db push` here — leaderboard & points persistence
# uses the zero-native-dependency JSON store (src/lib/scores.ts), so there is no
# query engine, no schema engine and no boot-time migration to fail on Render.
RUN bun run build

# ------------------------------- 3. runtime -------------------------------
FROM oven/bun:1.2-slim AS runner
USER root

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=10000

# Next.js standalone (server.js + traced node_modules) + assets
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# realtime socket.io mini-service (with its node_modules)
COPY --from=build /app/mini-services/anthakshari-service ./mini-services/anthakshari-service

# edge router + boot script (bun-native proxy — no external binaries)
COPY docker/edge-proxy.js /app/edge-proxy.js
COPY docker/start.sh /app/start.sh

RUN chmod +x /app/start.sh \
 && mkdir -p /app/db \
 && chown -R bun:bun /app/db

# run unprivileged (bun, uid 1000) — SQLite dir is writable by the app
USER bun

EXPOSE 10000
CMD ["/app/start.sh"]
