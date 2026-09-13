# syntax=docker/dockerfile:1

# ===========================================================================
# SingAlong — all-in-one image
#   Caddy (public $PORT)  →  Next.js standalone (:3000)
#                         →  realtime socket.io service (:3003)
# Works on Render / Fly.io / Hugging Face Spaces / any Docker host.
# ===========================================================================

# ----------------------------- 1. dependencies ----------------------------
FROM oven/bun:1.2-debian AS deps
WORKDIR /app

# openssl lets Prisma detect the distro's libssl (Debian 13 = libssl 3.x) and
# pick the matching engine flavor. Without it Prisma silently defaults to the
# openssl-1.1.x engine, which cannot load on this distro at query time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# realtime mini-service resolves its own dependencies
COPY mini-services/anthakshari-service/package.json mini-services/anthakshari-service/bun.lock ./mini-services/anthakshari-service/
RUN cd mini-services/anthakshari-service && bun install --frozen-lockfile

# -------------------------------- 2. build --------------------------------
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# prisma client (traced into the standalone bundle) + a standalone CLI bundle
# for `db push` at container boot. The CLI is pinned to the exact prisma
# version the app resolved, so engine flavors always match.
RUN bunx prisma generate \
 && mkdir -p /prisma-cli && cd /prisma-cli \
 && printf '{"name":"prisma-cli","private":true,"dependencies":{"prisma":"%s"}}\n' \
      "$(bun -e "console.log(require('/app/node_modules/prisma/package.json').version)")" \
      > package.json \
 && bun install

RUN bun run build

# ------------------------------- 3. runtime -------------------------------
FROM oven/bun:1.2-slim AS runner
USER root

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/app/db/custom.db \
    PORT=10000

# Next.js standalone (server.js + traced node_modules) + assets
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# realtime socket.io mini-service (with its node_modules)
COPY --from=build /app/mini-services/anthakshari-service ./mini-services/anthakshari-service

# prisma schema + standalone CLI so the container can `db push` on boot
COPY --from=build /app/prisma ./prisma
COPY --from=build /prisma-cli /prisma-cli

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
