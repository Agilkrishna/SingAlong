#!/usr/bin/env bash
# E2E: Singing rooms as a separate option + DesiHangout rebrand (Task 17)
#  - landing/room headers say DESI HANGOUT
#  - lobby filter tabs: All · 💬 Hangouts · 🎤 Singing (+ per-type empty states)
#  - creating a 🎤 Singing room drops it STRAIGHT into Sing mode
#    (video grid + activity bar from birth) with a 🎤 Singing room chip
#  - End flips to hangout layout but the room KEEPS its singing identity;
#    sing-start flips it back — kind (what it is) ≠ activity (what is running)
#  - server contract: kind fields via scripts/socket-probe.mjs
# Starts realtime :3003 + next :3000 + edge proxy :8099 and runs the whole
# browser flow inside THIS call (sandbox reaps background processes).
set -u
PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
has()  { agent-browser eval "$1" 2>/dev/null | tr -d '"' | grep -q true; }

echo "▶ [1] start realtime :3003 + next :3000 + edge proxy :8099"
pkill -9 -f "anthakshari-service" 2>/dev/null; pkill -f "edge-proxy.js" 2>/dev/null; sleep 0.5
# worklog lesson: a stubborn old bun can survive pkill and keep :3003 (new
# service then dies on EADDRINUSE and tests run against OLD code) — kill by
# port pid and VERIFY the port is actually free before starting.
for PORT_NO in 3003 3000; do
  for PID in $(ss -ltnp 2>/dev/null | grep ":$PORT_NO " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do
    kill -9 "$PID" 2>/dev/null
  done
done
sleep 0.7
if ss -ltn 2>/dev/null | grep -q ":3003 "; then echo "ABORT: :3003 still occupied"; ss -ltnp | grep 3003; exit 1; fi
setsid nohup bun /home/z/my-project/mini-services/anthakshari-service/index.ts >/home/z/my-project/scripts/realtime.log 2>&1 &
# standalone mode needs static assets copied next to server.js (the Dockerfile
# does this for Render; the sandbox E2E must redo it after every next build)
mkdir -p /home/z/my-project/.next/standalone/.next
rm -rf /home/z/my-project/.next/standalone/.next/static
cp -r /home/z/my-project/.next/static /home/z/my-project/.next/standalone/.next/static
rm -rf /home/z/my-project/.next/standalone/public
cp -r /home/z/my-project/public /home/z/my-project/.next/standalone/public
setsid nohup bun /home/z/my-project/.next/standalone/server.js >/home/z/my-project/scripts/next-3000.log 2>&1 &
for i in $(seq 1 30); do curl -sf -o /dev/null --max-time 2 http://127.0.0.1:3000/ && break; sleep 0.5; done
PORT=8099 setsid nohup bun /home/z/my-project/docker/edge-proxy.js >/home/z/my-project/scripts/edge-8099.log 2>&1 &
for i in $(seq 1 20); do
  curl -sf -o /dev/null --max-time 2 http://localhost:8099/ && break
  sleep 0.5
done
curl -s --max-time 3 "http://localhost:8099/socket.io/?EIO=4&transport=polling&XTransformPort=3003" | head -c 40 | grep -q '0{' \
  && ok "socket.io handshake via :8099" || bad "socket.io handshake via :8099"
sleep 1
if grep -q "DesiHangout realtime service running" /home/z/my-project/scripts/realtime.log 2>/dev/null && ! grep -qi "EADDRINUSE" /home/z/my-project/scripts/realtime.log 2>/dev/null; then
  ok "new service code confirmed (DesiHangout boot line, no EADDRINUSE)"
else
  echo "ABORT: realtime service did not boot clean:"; tail -5 /home/z/my-project/scripts/realtime.log; exit 1
fi

echo "▶ [2] landing is DesiHangout-branded → Goa"
agent-browser open "http://localhost:8099" >/dev/null 2>&1
sleep 2
BODY=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -qE "DESI.HANGOUT" && ok "landing brand is DESI HANGOUT" || bad "landing brand is DESI HANGOUT"
agent-browser find testid state-goa click >/dev/null 2>&1
sleep 2.5

echo "▶ [3] lobby filter tabs"
has "!!document.querySelector('[data-testid=\"filter-all\"]') && !!document.querySelector('[data-testid=\"filter-hangout\"]') && !!document.querySelector('[data-testid=\"filter-sing\"]')" \
  && ok "tabs All / 💬 Hangouts / 🎤 Singing present" || bad "tabs All / 💬 Hangouts / 🎤 Singing present"

echo "▶ [4] per-type empty states"
agent-browser find testid filter-sing click >/dev/null 2>&1; sleep 0.5
has "!!document.querySelector('[data-testid=\"singing-empty\"]')" \
  && ok "Singing tab: empty state shown" || bad "Singing tab: empty state shown"
has "!document.querySelector('[data-testid=\"join-featured\"]')" \
  && ok "Singing tab hides the featured state hangout" || bad "Singing tab hides the featured state hangout"
agent-browser find testid filter-hangout click >/dev/null 2>&1; sleep 0.5
has "!!document.querySelector('[data-testid=\"hangout-empty\"]')" \
  && ok "Hangouts tab: empty state shown (featured stays under All/Hangouts)" || bad "Hangouts tab: empty state shown"

echo "▶ [5] create a 🎤 Singing room"
agent-browser find testid filter-all click >/dev/null 2>&1; sleep 0.5
agent-browser find testid create-kind-sing click >/dev/null 2>&1; sleep 0.3
REF=$(agent-browser snapshot -i 2>/dev/null | rg -o 'textbox "New room name".*ref=(e[0-9]+)' -r '$1' | head -1)
[ -z "$REF" ] && { echo "ABORT: room name input ref not found"; agent-browser snapshot -i | head -30; exit 1; }
agent-browser type "@$REF" "Antakshari Adda" >/dev/null 2>&1
agent-browser find testid create-room-btn click >/dev/null 2>&1
sleep 2
has "!!document.querySelector('[data-testid=\"join-dialog\"]')" \
  && ok "join dialog auto-opened after Create" || bad "join dialog auto-opened after Create"
agent-browser find testid join-listener click >/dev/null 2>&1
sleep 2.5

echo "▶ [6] singing room opens STRAIGHT in sing mode"
has "!!document.querySelector('[data-testid=\"video-grid\"]')" \
  && ok "stage layout (video grid) from birth" || bad "stage layout (video grid) from birth"
has "!!document.querySelector('[data-testid=\"sing-activity-bar\"]')" \
  && ok "Sing Along activity bar live from birth" || bad "Sing Along activity bar live from birth"
has "!document.querySelector('[data-testid=\"hangout-area\"]')" \
  && ok "no chat-first layout in a fresh singing room" || bad "no chat-first layout in a fresh singing room"
has "!!document.querySelector('[data-testid=\"room-kind-chip\"]')" \
  && ok "header shows the 🎤 Singing room chip" || bad "header shows the 🎤 Singing room chip"
agent-browser screenshot /home/z/my-project/download/singing-room.png >/dev/null 2>&1 \
  && ok "screenshot: singing-room.png" || bad "screenshot: singing-room.png"

echo "▶ [7] End → hangout layout, singing identity kept"
agent-browser find testid sing-end click >/dev/null 2>&1
sleep 2
has "!!document.querySelector('[data-testid=\"hangout-area\"]')" \
  && ok "End flips the room to chat-first layout" || bad "End flips the room to chat-first layout"
has "!!document.querySelector('[data-testid=\"room-kind-chip\"]')" \
  && ok "room still keeps its 🎤 Singing identity after End" || bad "room still keeps its 🎤 Singing identity after End"

echo "▶ [8] sing-start flips it back on"
agent-browser find testid sing-start click >/dev/null 2>&1
sleep 2
has "!!document.querySelector('[data-testid=\"sing-activity-bar\"]')" \
  && ok "Sing Along restarts inside the singing room" || bad "Sing Along restarts inside the singing room"

echo "▶ [9] leave → back to the lobby"
agent-browser find testid leave-room click >/dev/null 2>&1
sleep 0.5
agent-browser find testid leave-confirm-action click >/dev/null 2>&1
sleep 2
has "!!document.querySelector('[data-testid=\"lobby-filters\"]')" \
  && ok "back in the lobby after leaving" || bad "back in the lobby after leaving"

echo "▶ [10] server contract probe (kind fields)"
PROBE=$(bun /home/z/my-project/scripts/socket-probe.mjs 2>&1)
echo "$PROBE" | sed 's/^/  /'
echo "$PROBE" | grep -q "PROBE: OK" \
  && ok "server contract: sing/hangout kinds + born-on-stage activity" || bad "server contract probe failed"

echo ""
echo "=== E2E RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
