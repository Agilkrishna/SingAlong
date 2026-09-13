# syntax=docker/dockerfile:1

# ===========================================================================
# SingAlong — all-in-one image
#   Caddy (public $PORT)  →  Next.js standalone (:3000)
#                         →  realtime socket.io service (:3003)
# Works on Render / Koyeb / Fly.io / Hugging Face Spaces / any Docker host.
# ===========================================================================

# ----------------------------- 1. dependencies ----------------------------
FROM oven/bun:1.2-debian AS deps
WORKDIR /app

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

# prisma client (traced into the standalone bundle) + standalone CLI for db push
RUN bunx prisma generate \
 && mkdir -p /prisma-cli && cd /prisma-cli \
 && echo '{"name":"prisma-cli","private":true,"dependencies":{"prisma":"6.11.1"}}' > package.json \
 && bun install

RUN bun run build

# ------------------------------- 3. runtime -------------------------------
FROM oven/bun:1.2-slim AS runner

# static caddy binary from the official image
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy

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

# edge router + boot script
COPY Caddyfile.prod /app/Caddyfile
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh && mkdir -p /app/db

EXPOSE 10000
CMD ["/app/start.sh"]
