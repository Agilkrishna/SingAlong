#!/bin/bash
# Rebuild download/singalong-github.zip from the project tree.
# Excludes match worklog Task 5 (nothing sensitive or heavy inside).
set -euo pipefail

ROOT=/home/z/my-project
STAGE=/tmp/singalong-github-stage
ZIP=$ROOT/download/singalong-github.zip

rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"

rsync -a \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'db/*.db' \
  --exclude 'db/*.db-journal' \
  --include '.env.example' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.log' \
  --exclude 'logs/' \
  --exclude 'download/' \
  --exclude 'examples/' \
  --exclude 'skills/' \
  --exclude 'tests/' \
  --exclude 'test/' \
  --exclude '.git/' \
  --exclude '.zscripts/' \
  --exclude 'worklog.md' \
  --exclude 'upload/' \
  --exclude '*.tsbuildinfo' \
  --exclude 'agent-ctx/' \
  "$ROOT/" "$STAGE/"

# sanity: keep the empty db dir in git
mkdir -p "$STAGE/db"
touch "$STAGE/db/.gitkeep"

cd "$STAGE"
zip -qr "$ZIP" .
echo "---- verify ----"
unzip -l "$ZIP" | tail -3
ZLIST=$(unzip -Z1 "$ZIP")
echo "---- key files present ----"
for f in Dockerfile docker/start.sh Caddyfile.prod render.yaml DEPLOY.md README.md LICENSE .env.example .dockerignore package.json bun.lock prisma/schema.prisma src/app/page.tsx src/app/favicon.ico src/app/icon.svg src/app/apple-icon.png mini-services/anthakshari-service/index.ts; do
  if grep -qxF "$f" <<<"$ZLIST"; then echo "  ✓ $f"; else echo "  ✗ MISSING: $f"; fi
done
echo "---- leak scan (must be empty) ----"
unzip -l "$ZIP" | grep -Ei '\.env$|\.env\.local|node_modules|\.next/|custom\.db$|worklog|\.log$' || echo "  ✓ no leaks"
unzip -p "$ZIP" Dockerfile | grep -q 'edge-proxy.js' && echo "  ✓ Dockerfile is the edge-proxy version"
unzip -p "$ZIP" docker/start.sh | grep -q 'exec bun /app/edge-proxy.js' && echo "  ✓ start.sh is the edge-proxy version"
unzip -p "$ZIP" docker/start.sh | grep -q '\-\-schema /app/prisma/schema.prisma' && echo "  ✓ start.sh has absolute prisma schema path"
unzip -Z1 "$ZIP" | grep -qxF 'src/app/favicon.ico' && echo "  ✓ red favicon.ico included"
unzip -Z1 "$ZIP" | grep -qxF 'src/app/icon.svg' && echo "  ✓ icon.svg included"
unzip -Z1 "$ZIP" | grep -qxF 'src/app/apple-icon.png' && echo "  ✓ apple-icon.png included"
unzip -p "$ZIP" DEPLOY.md | grep -q 'Mistral' && echo "  ✓ DEPLOY.md has Koyeb-closure note"
ls -lh "$ZIP"
