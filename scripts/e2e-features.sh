#!/usr/bin/env bash
# E2E: Task 18 feature pack — Listen Together · Watch Party · icebreakers ·
# Data Saver · EN/Hinglish toggle · host controls · report · block ·
# floating hearts · vibe tags.
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

echo "▶ [2] landing + EN ⇄ Hinglish toggle"
agent-browser open "http://localhost:8099" >/dev/null 2>&1
sleep 2
BODY=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -qE "DESI.HANGOUT" && ok "landing brand is DESI HANGOUT" || bad "landing brand is DESI HANGOUT"
agent-browser find testid lang-toggle click >/dev/null 2>&1
sleep 0.5
BODY=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "Apne poore State ke" && ok "हिंदी toggle: hero switches to Hinglish" || bad "हिंदी toggle: hero switches to Hinglish"
agent-browser find testid lang-toggle click >/dev/null 2>&1
sleep 0.5
BODY=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "Hang out with your" && ok "toggle back: hero returns to English" || bad "toggle back: hero returns to English"

echo "▶ [3] Goa lobby — vibe filters present"
agent-browser find testid state-goa click >/dev/null 2>&1
sleep 2.5
has "!!document.querySelector('[data-testid=\"vibe-filters\"]')" \
  && ok "vibe filter chip row present in the lobby" || bad "vibe filter chip row present in the lobby"
has "!!document.querySelector('[data-testid=\"tag-chip-retro\"]')" \
  && ok "vibe tag picker on the create-room form" || bad "vibe tag picker on the create-room form"

echo "▶ [4] create 'Retro Adda' with 📻 Retro tag → join as listener"
agent-browser find testid tag-chip-retro click >/dev/null 2>&1
sleep 0.3
REF=$(agent-browser snapshot -i 2>/dev/null | rg -o 'textbox "New room name".*ref=(e[0-9]+)' -r '$1' | head -1)
[ -z "$REF" ] && { echo "ABORT: room name input ref not found"; agent-browser snapshot -i | head -30; exit 1; }
agent-browser type "@$REF" "Retro Adda" >/dev/null 2>&1
agent-browser find testid create-room-btn click >/dev/null 2>&1
sleep 2
agent-browser find testid join-listener click >/dev/null 2>&1
sleep 2.5

echo "▶ [5] in-room: icebreaker + floating hearts"
ICE=$(agent-browser eval "document.querySelector('[data-testid=\"icebreaker\"]')?.textContent ?? ''" 2>/dev/null | tr -d '"')
if [ -n "$ICE" ] && [ ${#ICE} -gt 20 ]; then ok "daily icebreaker line shown: \"${ICE:0:44}…\""; else bad "daily icebreaker line shown (got: '$ICE')"; fi
has "!!document.querySelector('[data-testid=\"heart-send\"]')" \
  && ok "❤️ send-love button sits beside the chat input" || bad "❤️ send-love button sits beside the chat input"
agent-browser find testid heart-send click >/dev/null 2>&1
sleep 1
has "!!document.querySelector('[data-testid=\"hearts-layer\"]')" \
  && ok "tapping ❤️ makes hearts float for the room" || bad "tapping ❤️ makes hearts float for the room"

echo "▶ [6] People & safety + Data Saver"
agent-browser find testid people-btn click >/dev/null 2>&1
sleep 0.8
has "!!document.querySelector('[data-testid=\"people-panel\"]')" \
  && ok "People & safety panel opens from the header pill" || bad "People & safety panel opens from the header pill"
agent-browser find testid data-saver-toggle click >/dev/null 2>&1
sleep 0.5
has "!!document.querySelector('[data-testid=\"data-saver-chip\"]')" \
  && ok "Data Saver ON → 📶 chip in the header" || bad "Data Saver ON → 📶 chip in the header"
agent-browser find testid data-saver-toggle click >/dev/null 2>&1
sleep 0.5
has "!document.querySelector('[data-testid=\"data-saver-chip\"]')" \
  && ok "Data Saver OFF → chip gone" || bad "Data Saver OFF → chip gone"

echo "▶ [7] report the room"
agent-browser find testid report-room click >/dev/null 2>&1
sleep 0.8
has "!!document.querySelector('[data-testid=\"report-dialog\"]')" \
  && ok "report dialog opens with reasons" || bad "report dialog opens with reasons"
agent-browser find testid report-reason-abusive-language click >/dev/null 2>&1
sleep 0.3
agent-browser find testid report-submit click >/dev/null 2>&1
sleep 0.8
BODY=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "Report sent" && ok "report accepted → 'Report sent' toast" || bad "report accepted → 'Report sent' toast"

echo "▶ [8] Listen Together & Watch Party"
agent-browser find testid listen-start click >/dev/null 2>&1
sleep 1.5
has "!!document.querySelector('[data-testid=\"listen-activity-bar\"]')" \
  && ok "🎧 Listen Together activity bar live" || bad "🎧 Listen Together activity bar live"
has "!!document.querySelector('[data-testid=\"side-panel\"]')" \
  && ok "media panel auto-opens (karaoke picker)" || bad "media panel auto-opens (karaoke picker)"
agent-browser find testid activity-end click >/dev/null 2>&1
sleep 1.5
has "!!document.querySelector('[data-testid=\"hangout-area\"]') && !document.querySelector('[data-testid=\"listen-activity-bar\"]')" \
  && ok "End Listen Together → back to the hangout" || bad "End Listen Together → back to the hangout"
agent-browser find testid watch-start click >/dev/null 2>&1
sleep 1.5
has "!!document.querySelector('[data-testid=\"watch-activity-bar\"]')" \
  && ok "📺 Watch Party activity bar live" || bad "📺 Watch Party activity bar live"
agent-browser find testid activity-end click >/dev/null 2>&1
sleep 1.5
has "!document.querySelector('[data-testid=\"watch-activity-bar\"]')" \
  && ok "End Watch Party → back to the hangout" || bad "End Watch Party → back to the hangout"

echo "▶ [9] host controls: companion probe joins (room code read first)"
PROBE_OUT=/home/z/my-project/scripts/probe-host.out
SUBTITLE=$(agent-browser eval "document.querySelector('[data-testid=\"room-subtitle\"]')?.textContent ?? ''" 2>/dev/null | tr -d '"')
ROOM_ID=$(echo "$SUBTITLE" | grep -oE 'room code [A-Z0-9]{5}' | grep -oE '[A-Z0-9]{5}$')
[ -z "$ROOM_ID" ] && { echo "ABORT: room code not captured from subtitle: '$SUBTITLE'"; exit 1; }
ok "room code captured: $ROOM_ID"
: > "$PROBE_OUT"
setsid nohup bun /home/z/my-project/scripts/socket-probe-host.mjs "$ROOM_ID" "$PROBE_OUT" >/dev/null 2>&1 &
PROBE_PID=$!
for i in $(seq 1 20); do grep -q "PROBE-JOINED" "$PROBE_OUT" 2>/dev/null && break; sleep 0.5; done
grep -q "PROBE-JOINED" "$PROBE_OUT" \
  && ok "ProbeBot2 joined from a second socket" || bad "ProbeBot2 joined from a second socket"

echo "▶ [10] block the troublemaker (chat)"
for i in $(seq 1 16); do grep -q "PROBE-CHAT-SENT" "$PROBE_OUT" 2>/dev/null && break; sleep 0.5; done
sleep 1
BODY=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "hello from probe" && ok "probe chat message visible" || bad "probe chat message visible"
agent-browser find testid block-btn-probebot2 click >/dev/null 2>&1
sleep 0.8
has "!document.body.textContent.includes('hello from probe')" \
  && ok "blocked → their messages hidden from my chat" || bad "blocked → their messages hidden from my chat"
has "!!document.querySelector('[data-testid=\"blocked-note\"]')" \
  && ok "blocked-note shows in the chat" || bad "blocked-note shows in the chat"

echo "▶ [11] People panel: host powers over ProbeBot2"
agent-browser find testid people-btn click >/dev/null 2>&1
sleep 0.8
has "!!document.querySelector('[data-testid=\"people-row-ProbeBot2\"]')" \
  && ok "ProbeBot2 listed in People & safety" || bad "ProbeBot2 listed in People & safety"
has "!!document.querySelector('[data-testid=\"mute-ProbeBot2\"]') && !!document.querySelector('[data-testid=\"remove-ProbeBot2\"]')" \
  && ok "host sees Mute + Remove buttons on others" || bad "host sees Mute + Remove buttons on others"
agent-browser find testid unblock-probebot2 click >/dev/null 2>&1
sleep 0.8
has "!document.querySelector('[data-testid=\"blocked-note\"]')" \
  && ok "unblock from People panel clears the block" || bad "unblock from People panel clears the block"

echo "▶ [12] host-enforced mute"
agent-browser find testid mute-ProbeBot2 click >/dev/null 2>&1
sleep 1.5
has "document.querySelector('[data-testid=\"people-row-ProbeBot2\"]')?.textContent?.includes('muted by host')" \
  && ok "host mute: row shows 'muted by host'" || bad "host mute: row shows 'muted by host'"
grep -q "PROBE-FORCE-MUTED" "$PROBE_OUT" \
  && ok "target received the force-mute event" || bad "target received the force-mute event"

echo "▶ [13] host removes the troublemaker"
agent-browser find testid remove-ProbeBot2 click >/dev/null 2>&1
for i in $(seq 1 20); do grep -q "PROBE-REMOVED" "$PROBE_OUT" 2>/dev/null && break; sleep 0.5; done
grep -q "PROBE-REMOVED" "$PROBE_OUT" \
  && ok "ProbeBot2 was dropped with 'removed-from-room'" || bad "ProbeBot2 was dropped with 'removed-from-room'"
sleep 1.5
has "!document.querySelector('[data-testid=\"people-row-ProbeBot2\"]')" \
  && ok "ProbeBot2 is gone from the people list" || bad "ProbeBot2 is gone from the people list"
agent-browser press Escape >/dev/null 2>&1
sleep 0.5

echo "▶ [14] lobby: vibe tag on the card + vibe filter (probe keeps room alive)"
setsid nohup bun /home/z/my-project/scripts/socket-probe-host.mjs "$ROOM_ID" "$PROBE_OUT" occupy >/dev/null 2>&1 &
OCCUPY_PID=$!
for i in $(seq 1 20); do grep -q "PROBE-JOINED" "$PROBE_OUT" 2>/dev/null && break; sleep 0.5; done
agent-browser find testid leave-room click >/dev/null 2>&1
sleep 0.5
agent-browser find testid leave-confirm-action click >/dev/null 2>&1
sleep 2.5
# batch-B now pops a session recap card after every leave — close it so the
# modal overlay doesn't swallow the lobby vibe-filter clicks below
for i in $(seq 1 10); do
  agent-browser eval "!!document.querySelector('[data-testid=\"recap-dialog\"]')" 2>/dev/null | tr -d '"' | grep -q true && break
  sleep 0.5
done
agent-browser find testid recap-close click >/dev/null 2>&1
sleep 0.8
has "!!document.querySelector('[data-testid=\"room-tags-$ROOM_ID\"]')" \
  && ok "Retro Adda card carries its 📻 Retro tag" || bad "Retro Adda card carries its 📻 Retro tag"
agent-browser find testid vibe-filter-chai-time click >/dev/null 2>&1
sleep 0.5
has "!document.querySelector('[data-testid=\"room-tags-$ROOM_ID\"]')" \
  && ok "vibe filter ☕ Chai Time hides the Retro room" || bad "vibe filter ☕ Chai Time hides the Retro room"
agent-browser find testid vibe-filter-retro click >/dev/null 2>&1
sleep 0.5
has "!!document.querySelector('[data-testid=\"room-tags-$ROOM_ID\"]')" \
  && ok "vibe filter 📻 Retro shows it again" || bad "vibe filter 📻 Retro shows it again"
agent-browser find testid vibe-filter-all click >/dev/null 2>&1
kill -9 "$OCCUPY_PID" 2>/dev/null

echo "▶ [15] server contract probe (full feature pack)"
PROBE=$(bun /home/z/my-project/scripts/socket-probe-features.mjs 2>&1)
echo "$PROBE" | sed 's/^/  /'
echo "$PROBE" | grep -q "PROBE: OK" \
  && ok "server contract: tags · prompt · activities · host-mute coercion · reactions · reports · remove" \
  || bad "server contract probe failed"

agent-browser close >/dev/null 2>&1
echo ""
echo "=== E2E RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
