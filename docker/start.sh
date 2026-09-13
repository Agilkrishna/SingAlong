#!/bin/sh
# SingAlong — single-container boot.
# 1. create/upgrade the SQLite schema (absolute --schema path: CWD-independent)
# 2. start the realtime socket.io mini-service  (internal :3003)
# 3. start the Next.js standalone server        (internal :3000)
# 4. expose ONE public port via the bun edge proxy (public :$PORT)
set -e

: "${PORT:=10000}"
export PORT
export DATABASE_URL="${DATABASE_URL:-file:/app/db/custom.db}"

cd /app

echo "▶ [1/4] prisma db push (${DATABASE_URL})"
# NOTE: --schema must be absolute — the prisma binary lives in /prisma-cli,
# so a bare `prisma db push` would search for prisma/schema.prisma relative
# to /prisma-cli and fail with "Could not find Prisma Schema".
if /prisma-cli/node_modules/.bin/prisma db push \
     --schema /app/prisma/schema.prisma \
     --skip-generate --accept-data-loss; then
  echo "✓ database schema ready"
else
  echo "⚠ prisma db push failed — continuing (existing database will be used)"
fi

echo "▶ [2/4] realtime service  → 127.0.0.1:3003"
bun /app/mini-services/anthakshari-service/index.ts &

echo "▶ [3/4] next standalone   → 127.0.0.1:3000"
HOSTNAME=127.0.0.1 PORT=3000 NODE_ENV=production bun /app/server.js &

echo "▶ [4/4] edge (bun proxy)  → 0.0.0.0:${PORT}"
exec bun /app/edge-proxy.js
