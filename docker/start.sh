#!/bin/sh
# SingAlong — single-container boot.
# 1. start the realtime socket.io mini-service  (internal :3003)
# 2. start the Next.js standalone server        (internal :3000)
# 3. expose ONE public port via the bun edge proxy (public :$PORT)
#
# No database boot step: leaderboard & points persistence uses the
# zero-native-dependency JSON store (src/lib/scores.ts → /app/db/scores.json),
# which creates itself on first write — nothing to migrate, nothing to fail.
set -e

: "${PORT:=10000}"
export PORT
# scores.json lives on the writable /app/db volume created in the Dockerfile —
# pinned absolutely so the store never depends on the process cwd
export SCORES_FILE="${SCORES_FILE:-/app/db/scores.json}"

cd /app

echo "▶ [1/3] realtime service  → 127.0.0.1:3003"
bun /app/mini-services/anthakshari-service/index.ts &

echo "▶ [2/3] next standalone   → 127.0.0.1:3000"
HOSTNAME=127.0.0.1 PORT=3000 NODE_ENV=production bun /app/server.js &

echo "▶ [3/3] edge (bun proxy)  → 0.0.0.0:${PORT}"
exec bun /app/edge-proxy.js
