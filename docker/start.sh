#!/bin/sh
# SingAlong — single-container boot.
# 1. create/upgrade the SQLite schema
# 2. start the realtime socket.io mini-service  (internal :3003)
# 3. start the Next.js standalone server        (internal :3000)
# 4. expose ONE public port via Caddy           (public  :$PORT)
set -e

: "${PORT:=10000}"
export PORT
export DATABASE_URL="${DATABASE_URL:-file:/app/db/custom.db}"

echo "▶ [1/4] prisma db push (${DATABASE_URL})"
cd /prisma-cli
./node_modules/.bin/prisma db push --skip-generate --accept-data-loss || \
  echo "⚠ prisma db push failed — continuing (database may already exist)"

cd /app

echo "▶ [2/4] realtime service  → 127.0.0.1:3003"
bun /app/mini-services/anthakshari-service/index.ts &

echo "▶ [3/4] next standalone   → 127.0.0.1:3000"
HOSTNAME=127.0.0.1 PORT=3000 NODE_ENV=production bun /app/server.js &

echo "▶ [4/4] edge (caddy)      → 0.0.0.0:${PORT}"
exec caddy run --config /app/Caddyfile --adapter caddyfile
