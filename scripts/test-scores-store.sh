#!/bin/sh
# E2E for the JSON scores store behind /api/points + /api/leaderboard.
# Runs the REAL standalone production server (bun server.js) with NO DATABASE_URL,
# proving the leaderboard path has zero Prisma/native dependencies.
set -e
cd /home/z/my-project

BASE="http://127.0.0.1:3100"
PASS=0; FAIL=0

say()  { printf '\n== %s ==\n' "$1"; }
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

# assert_json NAME JSON PY_EXPR — python asserts expression against parsed json
assert_json() {
  if python3 -c "
import json,sys
d=json.loads(sys.argv[1])
sys.exit(0 if eval(sys.argv[2]) else 1)
" "$2" "$3" 2>/dev/null; then ok "$1"; else bad "$1 -- got: $2"; fi
}

pkill -9 -f "bun server.js" 2>/dev/null || true
pkill -9 -f "standalone/server.js" 2>/dev/null || true
sleep 1
rm -f db/scores.json db/*.tmp .next/standalone/db/scores.json

# bun chdirs to the script dir for relative entrypoints — pin the store file
# absolutely so the E2E asserts the SAME path the container uses
export SCORES_FILE="/home/z/my-project/db/scores.json"

say "boot standalone (production path, no DATABASE_URL)"
DATABASE_URL= HOSTNAME=127.0.0.1 PORT=3100 NODE_ENV=production \
  bun .next/standalone/server.js > /tmp/scores-e2e-server.log 2>&1 &
SRV=$!
for i in $(seq 1 40); do sleep 0.5; curl -sf -o /dev/null "$BASE/" && break; done
curl -sf -o /dev/null "$BASE/" || { echo "server never became ready"; exit 1; }
echo "  server ready (pid $SRV)"

say "1. empty boot → board loads with empty list (no crash on missing file)"
R=$(curl -s -m 10 "$BASE/api/leaderboard")
assert_json "empty board ok"        "$R" "d['ok']==True"
assert_json "empty board singers"   "$R" "d['singers']==[]"

say "2. POST /api/points flush (as the realtime service does)"
R=$(curl -s -m 10 -X POST "$BASE/api/points" -H 'content-type: application/json' \
  -d '{"updates":[{"name":"E2EBoardOne","state":"Goa","points":50,"poppers":2,"hearts":0,"performances":1},{"name":"E2EBoardTwo","state":"Goa","points":120,"poppers":0,"hearts":1,"performances":1},{"name":"E2EBoardThree","state":"Delhi","points":10,"poppers":1,"hearts":0,"performances":1}]}')
assert_json "points flush accepted" "$R" "d['ok']==True and d['count']==3"

say "3. state-filtered board: Goa sorted by points desc"
R=$(curl -s -m 10 "$BASE/api/leaderboard?state=Goa")
assert_json "Goa has 2 singers"     "$R" "len(d['singers'])==2"
assert_json "Goa #1 is BoardTwo"    "$R" "d['singers'][0]['name']=='E2EBoardTwo' and d['singers'][0]['points']==120"
assert_json "Goa #2 is BoardOne"    "$R" "d['singers'][1]['name']=='E2EBoardOne' and d['singers'][1]['points']==50"

say "4. All-India board ordering (120 > 50 > 10)"
R=$(curl -s -m 10 "$BASE/api/leaderboard")
assert_json "All-India 3 singers"   "$R" "len(d['singers'])==3"
assert_json "order BoardTwo>One>Three" "$R" "[s['name'] for s in d['singers']]==['E2EBoardTwo','E2EBoardOne','E2EBoardThree']"

say "5. increments accumulate on a second flush"
curl -s -m 10 -X POST "$BASE/api/points" -H 'content-type: application/json' \
  -d '{"updates":[{"name":"E2EBoardOne","state":"Goa","points":10,"poppers":0,"hearts":0,"performances":0}]}' > /dev/null
R=$(curl -s -m 10 "$BASE/api/leaderboard?state=Goa")
assert_json "BoardOne incremented to 60" "$R" "d['singers'][1]['points']==60"

say "6. persistence across a full server restart"
kill -9 $SRV 2>/dev/null || true; sleep 1
HOSTNAME=127.0.0.1 PORT=3100 NODE_ENV=production \
  bun .next/standalone/server.js >> /tmp/scores-e2e-server.log 2>&1 &
SRV=$!
for i in $(seq 1 40); do sleep 0.5; curl -sf -o /dev/null "$BASE/" && break; done
curl -sf -o /dev/null "$BASE/" || { echo "  restarted server never became ready"; exit 1; }
R=$(curl -s -m 10 "$BASE/api/leaderboard?state=Goa")
assert_json "survives restart (60 still there)" "$R" "d['singers'][1]['points']==60"
assert_json "survives restart (120 still there)" "$R" "d['singers'][0]['points']==120"

say "7. scores.json on disk"
python3 -c "
import json
d=json.load(open('db/scores.json'))
n=sorted(d['singers'], key=lambda k: -d['singers'][k]['points'])
assert [x['points'] for x in map(d['singers'].get, n)]==[120,60,10], n
print('  ✓ file valid JSON, points [120, 60, 10], singers:', n)
" && PASS=$((PASS+1)) || { bad "scores.json contents"; FAIL=$((FAIL+1)); }

kill -9 $SRV 2>/dev/null || true
pkill -9 -f "bun server.js" 2>/dev/null || true
pkill -9 -f "standalone/server.js" 2>/dev/null || true

printf '\n===== %d PASSED / %d FAILED =====\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
