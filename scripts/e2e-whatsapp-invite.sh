#!/usr/bin/env bash
# E2E: WhatsApp one-tap invite + deep link join
# Starts the edge proxy (:8099 → next :3000 / realtime :3003) and runs the
# whole browser flow inside THIS call (sandbox reaps background processes
# between tool calls).
set -u
PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "▶ [1] start edge proxy :8099"
pkill -f "edge-proxy.js" 2>/dev/null; sleep 0.5
PORT=8099 setsid nohup bun /home/z/my-project/docker/edge-proxy.js >/home/z/my-project/scripts/edge-8099.log 2>&1 &
for i in $(seq 1 20); do
  curl -sf -o /dev/null --max-time 2 http://localhost:8099/ && break
  sleep 0.5
done
curl -s --max-time 3 "http://localhost:8099/socket.io/?EIO=4&transport=polling&XTransformPort=3003" | head -c 40 | grep -q '0{' \
  && ok "socket.io handshake via :8099" || bad "socket.io handshake via :8099"

echo "▶ [2] fresh landing on :8099 → Goa lobby"
agent-browser open "http://localhost:8099" >/dev/null 2>&1
sleep 2
agent-browser find testid state-goa click >/dev/null 2>&1
sleep 1.5

echo "▶ [3] create custom room 'Bollywood Retro Night' (join as listener)"
REF=$(agent-browser snapshot -i 2>/dev/null | rg -o 'textbox "New room name" \[ref=(e[0-9]+)\]' -r '$1' | head -1)
agent-browser type "@$REF" "Bollywood Retro Night" >/dev/null 2>&1
CRE=$(agent-browser snapshot -i 2>/dev/null | rg -o 'button "CREATE" \[enabled, ref=(e[0-9]+)\]' -r '$1' | head -1)
[ -z "$CRE" ] && CRE=$(agent-browser snapshot -i 2>/dev/null | rg -o 'button "CREATE".*ref=(e[0-9]+)' -r '$1' | head -1)
agent-browser click "@$CRE" >/dev/null 2>&1
sleep 2
agent-browser eval "!!document.querySelector('[data-testid=\"join-dialog\"]')" 2>/dev/null | grep -q true \
  && ok "join dialog auto-opened after Create" || bad "join dialog auto-opened after Create"
agent-browser find testid join-listener click >/dev/null 2>&1
sleep 2
agent-browser eval "!!document.querySelector('[data-testid=\"video-grid\"]')" 2>/dev/null | grep -q true \
  && ok "in room (video grid visible)" || bad "in room (video grid visible)"

echo "▶ [4] read room code from header"
ROOM_CODE=$(agent-browser eval "document.querySelector('[data-testid=\"room-title\"]').nextElementSibling.textContent.match(/room code ([A-Z0-9]{5})/)?.[1]||''" 2>/dev/null | tr -d '"')
[ -n "$ROOM_CODE" ] && ok "room code captured: $ROOM_CODE" || bad "room code captured (got '$ROOM_CODE')"
if [ -z "$ROOM_CODE" ]; then echo "ABORT: no room code — proxy/service path is broken"; exit 1; fi

echo "▶ [5] intercept window.open, tap header WhatsApp share"
agent-browser eval "window.__wa=null; window.open=(u)=>{window.__wa=String(u); return {focus(){},close(){}}}; 'hooked'" >/dev/null 2>&1
agent-browser find testid room-share click >/dev/null 2>&1
sleep 1
WA=$(agent-browser eval "window.__wa" 2>/dev/null | tr -d '"')
echo "$WA" | grep -q "^https://wa.me/?text=" && ok "wa.me URL opened" || bad "wa.me URL opened (got '$WA')"
TEXT=$(python3 - <<PY
import urllib.parse,sys
wa="$WA"
try: print(urllib.parse.unquote(wa.split("text=",1)[1]))
except Exception: print("")
PY
)
echo "$TEXT" | grep -q "Bollywood Retro Night" && ok "invite text has room name" || bad "invite text has room name"
echo "$TEXT" | grep -qi "Room code: $ROOM_CODE" && ok "invite text has room code" || bad "invite text has room code"
echo "$TEXT" | grep -q "room=$ROOM_CODE" && ok "invite deep-link carries room id" || bad "invite deep-link carries room id"
echo "$TEXT" | grep -q "s=Goa" && ok "invite deep-link carries state" || bad "invite deep-link carries state"

echo "▶ [6] solo-state invite CTA"
agent-browser eval "!!document.querySelector('[data-testid=\"room-share-solo\"]')" 2>/dev/null | grep -q true \
  && ok "solo invite CTA visible (alone in room)" || bad "solo invite CTA visible (alone in room)"
agent-browser find testid room-share-solo click >/dev/null 2>&1
sleep 1
WA2=$(agent-browser eval "window.__wa" 2>/dev/null | tr -d '"')
echo "$WA2" | grep -q "^https://wa.me/?text=" && ok "solo CTA opens a wa.me invite" || bad "solo CTA wa.me (got '$WA2')"

echo "▶ [7] deep link /?room=$ROOM_CODE&s=Goa auto-opens the join dialog"
agent-browser open "http://localhost:8099/?room=$ROOM_CODE&s=Goa" >/dev/null 2>&1
sleep 2.5
DNAME=$(agent-browser eval "document.querySelector('[data-testid=\"join-dialog-room\"]')?.textContent||''" 2>/dev/null | tr -d '"')
echo "$DNAME" | grep -qi "$ROOM_CODE" && ok "dialog names the invited room ('$DNAME')" || bad "dialog names the invited room ('$DNAME')"
CLEAN=$(agent-browser eval "window.location.search" 2>/dev/null | tr -d '"')
[ -z "$CLEAN" ] && ok "URL params consumed (address bar clean)" || bad "URL params consumed (still '$CLEAN')"
agent-browser find testid join-listener click >/dev/null 2>&1
sleep 2.5
agent-browser eval "!!document.querySelector('[data-testid=\"video-grid\"]')" 2>/dev/null | grep -q true \
  && ok "invitee landed in the room" || bad "invitee landed in the room"
CODE2=$(agent-browser eval "document.querySelector('[data-testid=\"room-title\"]').nextElementSibling.textContent.match(/room code ([A-Z0-9]{5})/)?.[1]||''" 2>/dev/null | tr -d '"')
[ "$CODE2" = "$ROOM_CODE" ] && ok "room code matches invite ($CODE2)" || bad "room code matches invite ($CODE2 vs $ROOM_CODE)"

echo "▶ [8] deep link to default state stage /?room=state:goa&s=Goa"
agent-browser open "http://localhost:8099/?room=state%3Agoa&s=Goa" >/dev/null 2>&1
sleep 2.5
DNAME2=$(agent-browser eval "document.querySelector('[data-testid=\"join-dialog-room\"]')?.textContent||''" 2>/dev/null | tr -d '"')
echo "$DNAME2" | grep -qi "Goa Singers" && ok "default-stage dialog named ('$DNAME2')" || bad "default-stage dialog named ('$DNAME2')"
agent-browser find testid join-listener click >/dev/null 2>&1
sleep 2.5
agent-browser eval "!!document.querySelector('[data-testid=\"video-grid\"]')" 2>/dev/null | grep -q true \
  && ok "joined Goa Singers open stage" || bad "joined Goa Singers open stage"
ST=$(agent-browser eval "document.querySelector('[data-testid=\"room-title\"]').nextElementSibling.textContent.split('·')[0].trim()" 2>/dev/null | tr -d '"')
echo "$ST" | grep -qi "Goa" && ok "room state is Goa ('$ST')" || bad "room state is Goa ('$ST')"

echo ""
echo "=== E2E RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
