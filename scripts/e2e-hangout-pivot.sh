#!/usr/bin/env bash
# E2E: Hangout pivot — rooms are chat-first hangouts; Sing Along is an
# activity anyone starts (room flips to stage layout) and ends (back to chat).
# Starts realtime :3003 + next :3000 + edge proxy :8099 and runs the whole
# browser flow inside THIS call (sandbox reaps background processes between
# tool calls).
set -u
PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
has()  { agent-browser eval "$1" 2>/dev/null | tr -d '"' | grep -q true; }

echo "▶ [1] start realtime :3003 + next :3000 + edge proxy :8099"
pkill -9 -f "anthakshari-service" 2>/dev/null; pkill -f "edge-proxy.js" 2>/dev/null; sleep 0.5
# worklog lesson: kill stubborn port owners by pid and VERIFY the port is free
for PORT_NO in 3003 3000 8099; do
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
sleep 1
if ! grep -q "DesiHangout realtime service running" /home/z/my-project/scripts/realtime.log 2>/dev/null || grep -qi "EADDRINUSE" /home/z/my-project/scripts/realtime.log 2>/dev/null; then
  echo "ABORT: realtime service did not boot clean:"; tail -5 /home/z/my-project/scripts/realtime.log; exit 1
fi
curl -s --max-time 3 "http://localhost:8099/socket.io/?EIO=4&transport=polling&XTransformPort=3003" | head -c 40 | grep -q '0{' \
  && ok "socket.io handshake via :8099" || bad "socket.io handshake via :8099"

echo "▶ [2] landing is hangout-branded → Goa"
agent-browser open "http://localhost:8099" >/dev/null 2>&1
sleep 2
BODY=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "Hang out with your" && ok "hero says 'Hang out with your entire State'" || bad "hero copy (hangout branding)"
agent-browser find testid state-goa click >/dev/null 2>&1
sleep 1.5

echo "▶ [3] lobby: state hangouts"
LOB=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
echo "$LOB" | grep -q "Hangouts" && ok "lobby heading says Hangouts" || bad "lobby heading says Hangouts"
FEAT=$(agent-browser eval "document.querySelector('[data-testid=\"join-featured\"]')?.textContent||''" 2>/dev/null | tr -d '"')
echo "$FEAT" | grep -qi "Goa Hangout" && ok "featured room is 'Goa Hangout' ('$FEAT')" || bad "featured room is 'Goa Hangout' (got '$FEAT')"

echo "▶ [4] join featured as listener → lands in HANGOUT mode"
agent-browser find testid join-featured click >/dev/null 2>&1
sleep 1.5
DNAME=$(agent-browser eval "document.querySelector('[data-testid=\"join-dialog-room\"]')?.textContent||''" 2>/dev/null | tr -d '"')
echo "$DNAME" | grep -qi "Goa Hangout" && ok "join dialog names 'Goa Hangout' ('$DNAME')" || bad "join dialog names 'Goa Hangout' (got '$DNAME')"
agent-browser find testid join-listener click >/dev/null 2>&1
sleep 2
has "!!document.querySelector('[data-testid=\"hangout-area\"]')" \
  && ok "hangout view rendered (chat-first)" || bad "hangout view rendered (chat-first)"
has "!!document.querySelector('[data-testid=\"cam-strip\"]')" \
  && ok "cam strip visible" || bad "cam strip visible"
has "!!document.querySelector('[data-testid=\"chat-input\"]')" \
  && ok "chat input is the main surface" || bad "chat input is the main surface"
has "!document.querySelector('[data-testid=\"side-panel\"]')" \
  && ok "no side panel in hangout" || bad "no side panel in hangout"
has "!document.querySelector('[data-testid=\"sing-activity-bar\"]')" \
  && ok "no Sing Along bar in hangout" || bad "no Sing Along bar in hangout"

echo "▶ [5] chat works as the primary surface"
REF=$(agent-browser snapshot -i 2>/dev/null | rg -o 'textbox "Chat message".*ref=(e[0-9]+)' -r '$1' | head -1)
[ -z "$REF" ] && { echo "ABORT: chat input ref not found"; agent-browser snapshot -i | head -30; exit 1; }
agent-browser type "@$REF" "hello from the hangout" >/dev/null 2>&1
agent-browser find testid chat-send click >/dev/null 2>&1
sleep 1.5
has "document.querySelector('[data-testid=\"chat-panel\"]')?.textContent.includes('hello from the hangout')" \
  && ok "message sent + echoed in room chat" || bad "message sent + echoed in room chat"

echo "▶ [6] one tap on 🎤 flips the room into Sing Along"
agent-browser find testid sing-start click >/dev/null 2>&1
sleep 2
has "!!document.querySelector('[data-testid=\"sing-activity-bar\"]')" \
  && ok "Sing Along activity bar appeared" || bad "Sing Along activity bar appeared"
has "!!document.querySelector('[data-testid=\"sing-end\"]')" \
  && ok "End button available to everyone" || bad "End button available to everyone"
has "!!document.querySelector('[data-testid=\"side-panel\"]')" \
  && ok "side panel open (Main Seat by default)" || bad "side panel open (Main Seat by default)"
has "!!document.querySelector('[data-testid=\"video-grid\"]')" \
  && ok "stage layout (video grid) rendered" || bad "stage layout (video grid) rendered"
has "!document.querySelector('[data-testid=\"hangout-area\"]')" \
  && ok "hangout view replaced" || bad "hangout view replaced"
# in sing mode the chat lives in the side panel — open it and check history
agent-browser eval "document.querySelector('[aria-label=\"Toggle chat\"]')?.click(); 'ok'" >/dev/null 2>&1
sleep 1
has "document.querySelector('[data-testid=\"chat-panel\"]')?.textContent.includes('started Sing Along')" \
  && ok "system message announced the activity (chat reachable in sing mode)" || bad "system message announced the activity"
agent-browser screenshot /home/z/my-project/download/sing-mode.png >/dev/null 2>&1 \
  && ok "screenshot: sing-mode.png" || bad "screenshot: sing-mode.png"

echo "▶ [7] End drops everyone back into the hangout"
agent-browser find testid sing-end click >/dev/null 2>&1
sleep 2
has "!!document.querySelector('[data-testid=\"hangout-area\"]')" \
  && ok "back to hangout view" || bad "back to hangout view"
has "!document.querySelector('[data-testid=\"sing-activity-bar\"]')" \
  && ok "activity bar gone" || bad "activity bar gone"
has "!document.querySelector('[data-testid=\"side-panel\"]')" \
  && ok "side panel closed" || bad "side panel closed"
has "document.querySelector('[data-testid=\"hangout-chat\"]')?.textContent.includes('ended the Sing Along')" \
  && ok "system message announced the end" || bad "system message announced the end"
agent-browser screenshot /home/z/my-project/download/hangout-mode.png >/dev/null 2>&1 \
  && ok "screenshot: hangout-mode.png" || bad "screenshot: hangout-mode.png"

echo ""
echo "=== E2E RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
