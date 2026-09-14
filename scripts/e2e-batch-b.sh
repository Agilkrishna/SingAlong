#!/usr/bin/env bash
# E2E: Task 19 batch B — avatars · streaks & badges · party games (quiz /
# truth-dare / rapid-fire) · Antakshari letter game · passcode-locked rooms ·
# scheduled rooms ("Starting soon" + remind) · session recap card ·
# network chip · auto-rejoin grace (server contract in the probe).
# Starts realtime :3003 + next :3000 + edge proxy :8099 and runs the whole
# browser flow inside THIS call (sandbox reaps background processes).
set -u
PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
has()  { agent-browser eval "$1" 2>/dev/null | tr -d '"' | grep -q true; }
# poll an eval expression until true (default 8s) — fixed sleeps race Radix animations
waitfor() {
  local expr="$1" tries="${2:-16}"
  for _ in $(seq 1 "$tries"); do
    has "$expr" && return 0
    sleep 0.5
  done
  return 1
}
# leave the room through the confirm dialog and wait until the lobby is back
# (recap card left OPEN for the caller — close with close_recap)
leave_confirmed() {
  agent-browser find testid leave-room click >/dev/null 2>&1
  if ! waitfor "!!document.querySelector('[data-testid=\"leave-confirm\"]')" "6"; then
    echo "    (leave-confirm not up — retrying leave-room click)"
    agent-browser find testid leave-room click >/dev/null 2>&1
    waitfor "!!document.querySelector('[data-testid=\"leave-confirm\"]')" || { echo "    (stage: confirm dialog never opened)"; return 1; }
  fi
  agent-browser find testid leave-confirm-action click >/dev/null 2>&1
  if ! waitfor "document.body.textContent.includes('Open your own')" "16"; then
    echo "    (stage: confirm clicked but lobby marker missing)"
    return 1
  fi
  return 0
}
close_recap() {
  waitfor "!!document.querySelector('[data-testid=\"recap-dialog\"]')" "10" || true
  agent-browser find testid recap-close click >/dev/null 2>&1
  waitfor "!document.querySelector('[data-testid=\"recap-dialog\"]')" "10" || true
  return 0
}

echo "▶ [1] start realtime :3003 + next :3000 + edge proxy :8099"
pkill -9 -f "anthakshari-service" 2>/dev/null; pkill -f "edge-proxy.js" 2>/dev/null; sleep 0.5
for PORT_NO in 3003 3000; do
  for PID in $(ss -ltnp 2>/dev/null | grep ":$PORT_NO " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do
    kill -9 "$PID" 2>/dev/null
  done
done
sleep 0.7
if ss -ltn 2>/dev/null | grep -q ":3003 "; then echo "ABORT: :3003 still occupied"; ss -ltnp | grep 3003; exit 1; fi
setsid nohup bun /home/z/my-project/mini-services/anthakshari-service/index.ts >/home/z/my-project/scripts/realtime.log 2>&1 &
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
if grep -q "DesiHangout realtime service running" /home/z/my-project/scripts/realtime.log 2>/dev/null && ! grep -qi "EADDRINUSE" /home/z/my-project/scripts/realtime.log 2>/dev/null; then
  ok "service booted clean (DesiHangout boot line, no EADDRINUSE)"
else
  echo "ABORT: realtime service did not boot clean:"; tail -5 /home/z/my-project/scripts/realtime.log; exit 1
fi

echo "▶ [2] server contract probe (avatars · passcode · schedule · quiz · prompts · antakshari · rejoin grace)"
PROBE=$(bun /home/z/my-project/scripts/socket-probe-batchb.mjs 2>&1)
echo "$PROBE" | sed 's/^/  /'
echo "$PROBE" | grep -q "PROBE: OK" \
  && ok "server contract: avatars · locked rooms · scheduled listing · quiz reveal scoring · prompts · antakshari · rejoin grace · latency" \
  || bad "server contract probe failed"

echo "▶ [3] Goa lobby: Starting soon + scheduled card (rooms seeded by the probe)"
agent-browser open "http://localhost:8099" >/dev/null 2>&1
sleep 2
agent-browser find testid state-goa click >/dev/null 2>&1
sleep 6   # lobby polls every 5s — wait for the probe's rooms to appear
BODY=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "Starting soon" && ok "'Starting soon' section live in the lobby" || bad "'Starting soon' section live in the lobby"
echo "$BODY" | grep -q "Antakshari Tonight" && ok "scheduled room 'Antakshari Tonight' listed while empty" || bad "scheduled room 'Antakshari Tonight' listed while empty"
REMIND_ID=$(agent-browser eval "document.querySelector('[data-testid^=\"remind-\"]')?.getAttribute('data-testid')?.slice(7) ?? ''" 2>/dev/null | tr -d '"')
if [ -n "$REMIND_ID" ]; then
  agent-browser find testid "remind-$REMIND_ID" click >/dev/null 2>&1
  sleep 0.8
  BODY=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
  echo "$BODY" | grep -q "Reminder set" && ok "🔔 Remind me → 'Reminder set' toast" || bad "🔔 Remind me → 'Reminder set' toast"
else
  bad "no remind button found (scheduled room missing)"
fi
# React-controlled inputs need the native setter + input event
testval() {
  agent-browser eval "(() => { const el = document.querySelector('[data-testid=\"$1\"]'); if (!el) return false; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, '$2'); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()" 2>/dev/null | tr -d '"' | grep -q true \
    && ok "set $1 = '$2'" || bad "set $1 = '$2'"
}

echo "▶ [4] join dialog: avatar picker + streak line"
agent-browser find testid join-featured click >/dev/null 2>&1
sleep 1.2
has "!!document.querySelector('[data-testid=\"avatar-picker\"]')" \
  && ok "avatar picker renders in the join dialog" || bad "avatar picker renders in the join dialog"
AV_OK=0
for _ in $(seq 1 3); do
  agent-browser find testid avatar-8 click >/dev/null 2>&1
  sleep 0.5
  if has "document.querySelector('[data-testid=\"avatar-8\"]')?.getAttribute('aria-pressed') === 'true'"; then AV_OK=1; break; fi
done
[ "$AV_OK" -eq 1 ] \
  && ok "avatar selectable (aria-pressed)" || bad "avatar selectable (aria-pressed)"
BODY=$(agent-browser eval "document.body.textContent" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "streak" && ok "streak line shows in the join dialog" || bad "streak line shows in the join dialog"

echo "▶ [5] in-room: avatar shows on my tile row + net chip"
agent-browser find testid join-listener click >/dev/null 2>&1
sleep 2.5
agent-browser find testid people-btn click >/dev/null 2>&1
sleep 0.8
BODY=$(agent-browser eval "document.querySelector('[data-testid=\"people-panel\"]')?.textContent ?? ''" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "🎸" && ok "my picked avatar (🎸) shows on my people row" || bad "my picked avatar (🎸) shows on my people row"
agent-browser press Escape >/dev/null 2>&1
sleep 0.5
has "!!document.querySelector('[data-testid=\"net-chip\"]')" \
  && ok "network-quality chip present in the header" || bad "network-quality chip present in the header"
sleep 7  # first latency probe lands after ~6s
NET=$(agent-browser eval "document.querySelector('[data-testid=\"net-chip\"]')?.textContent ?? ''" 2>/dev/null | tr -d '"')
echo "$NET" | grep -qE "g|ok|poor" && ok "net chip shows measured quality ($NET)" || bad "net chip shows measured quality (got '$NET')"

echo "▶ [6] party games: quiz"
agent-browser find testid games-open click >/dev/null 2>&1
sleep 1.2
has "!!document.querySelector('[data-testid=\"games-panel\"]')" \
  && ok "games panel opens from the toolbar" || bad "games panel opens from the toolbar"
agent-browser find testid quiz-start-btn click >/dev/null 2>&1
sleep 1.5
has "!!document.querySelector('[data-testid=\"quiz-live\"]') && !!document.querySelector('[data-testid=\"quiz-question\"]')" \
  && ok "quiz live: question + options rendered" || bad "quiz live: question + options rendered"
agent-browser find testid quiz-option-1 click >/dev/null 2>&1
sleep 1
has "!!document.querySelector('[data-testid=\"quiz-waiting\"]')" \
  && ok "answer locked — waiting for the reveal" || bad "answer locked — waiting for the reveal"
has "!!document.querySelector('[data-testid=\"quiz-chip\"]')" \
  && ok "🎲 quiz-live chip visible beside the icebreaker" || bad "🎲 quiz-live chip visible beside the icebreaker"

echo "▶ [7] party games: truth or dare"
agent-browser find testid games-tab-truth click >/dev/null 2>&1
sleep 0.5
agent-browser find testid prompts-start click >/dev/null 2>&1
sleep 1.2
has "!!document.querySelector('[data-testid=\"prompts-text\"]')" \
  && ok "truth prompt card rendered" || bad "truth prompt card rendered"
agent-browser find testid prompts-next click >/dev/null 2>&1
sleep 1
has "!!document.querySelector('[data-testid=\"prompts-text\"]')" \
  && ok "next prompt spun" || bad "next prompt spun"

echo "▶ [8] leave → session recap card"
agent-browser find testid games-open click >/dev/null 2>&1
sleep 0.8
agent-browser find testid chat-input fill "recap test" >/dev/null 2>&1
agent-browser find testid chat-send click >/dev/null 2>&1
sleep 0.5
leave_confirmed \
  && ok "left the room through the confirm dialog" || bad "robust leave flow failed"
waitfor "!!document.querySelector('[data-testid=\"recap-dialog\"]') && !!document.querySelector('[data-testid=\"recap-title\"]')" \
  && ok "session recap card appears after leaving" || bad "session recap card appears after leaving"
BODY=$(agent-browser eval "document.querySelector('[data-testid=\"recap-dialog\"]')?.textContent ?? ''" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "1 min\|messages" && ok "recap stats render (time + messages)" || bad "recap stats render (got: '${BODY:0:60}')"
agent-browser eval "window.open = (u) => { window.__wa = String(u); return { focus(){}, close(){} } }" >/dev/null 2>&1
agent-browser find testid recap-share click >/dev/null 2>&1
sleep 1
WA=$(agent-browser eval "window.__wa ?? ''" 2>/dev/null | tr -d '"')
if [ -n "$WA" ] && echo "$WA" | grep -q "wa.me"; then
  ok "recap share builds a wa.me link"
  echo "$WA" | grep -q "DesiHangout" && ok "recap text carries the brand" || bad "recap text carries the brand"
else
  bad "recap share builds a wa.me link (got '$WA')"
fi
agent-browser find testid recap-close click >/dev/null 2>&1
sleep 0.8
has "!document.querySelector('[data-testid=\"recap-dialog\"]')" \
  && ok "recap closes back into the lobby" || bad "recap closes back into the lobby"

echo "▶ [9] locked room: create with passcode → refused → code → in"
agent-browser find testid new-room-name fill "Locked Lounge" >/dev/null 2>&1
testval "new-room-passcode" "4242"
agent-browser find testid create-room-btn click >/dev/null 2>&1
sleep 2
agent-browser find testid join-listener click >/dev/null 2>&1
sleep 1.5
has "!!document.querySelector('[data-testid=\"passcode-box\"]')" \
  && ok "locked room → passcode box appears on refusal" || bad "locked room → passcode box appears on refusal"
testval "join-passcode-input" "4242"
agent-browser find testid join-singer click >/dev/null 2>&1
sleep 2.5
BODY=$(agent-browser eval "document.querySelector('[data-testid=\"room-title\"]')?.textContent ?? ''" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "Locked Lounge" && ok "correct passcode lands in 'Locked Lounge'" || bad "correct passcode lands in 'Locked Lounge' (got '$BODY')"
leave_confirmed && ok "left Locked Lounge cleanly" || bad "leave Locked Lounge failed"
close_recap

echo "▶ [10] Antakshari letter game in a singing room"
agent-browser find testid create-kind-sing click >/dev/null 2>&1
sleep 0.3
# verify the create form is live before typing (poll instead of snapshot refs)
waitfor "!!document.querySelector('[data-testid=\"new-room-name\"]')" || { echo "ABORT: new-room-name input not found"; exit 1; }
agent-browser find testid new-room-name fill "Letter Battle Live" >/dev/null 2>&1
agent-browser find testid create-room-btn click >/dev/null 2>&1
sleep 2
agent-browser find testid join-listener click >/dev/null 2>&1
sleep 2.5
has "!!document.querySelector('[data-testid=\"antakshari-box\"]')" \
  && ok "Antakshari box lives on the stage panel" || bad "Antakshari box lives on the stage panel"
agent-browser find testid antakshari-start click >/dev/null 2>&1
sleep 1.5
has "!!document.querySelector('[data-testid=\"antakshari-live\"]') && !!document.querySelector('[data-testid=\"antakshari-letter\"]')" \
  && ok "antakshari live: letter + turn timer shown" || bad "antakshari live: letter + turn timer shown"
LETTER1=$(agent-browser eval "document.querySelector('[data-testid=\"antakshari-letter\"]')?.textContent ?? ''" 2>/dev/null | tr -d '"')
testval "antakshari-song-input" "Kaho Naa Pyaar Hai"
agent-browser find testid antakshari-done click >/dev/null 2>&1
sleep 1.5
BODY=$(agent-browser eval "document.querySelector('[data-testid=\"antakshari-scores\"]')?.textContent ?? ''" 2>/dev/null | tr -d '"')
echo "$BODY" | grep -q "10" && ok "singing awarded +10 and the scores board shows it" || bad "singing awarded +10 (got '$BODY')"
LETTER2=$(agent-browser eval "document.querySelector('[data-testid=\"antakshari-letter\"]')?.textContent ?? ''" 2>/dev/null | tr -d '"')
if echo "$LETTER2" | grep -qE "^[A-Z]$" && [ "$LETTER2" != "$LETTER1" ]; then
  ok "letter advanced from the song's last letter ($LETTER1 → $LETTER2)"
else
  bad "letter advanced (got '$LETTER1' → '$LETTER2')"
fi

agent-browser close >/dev/null 2>&1
echo ""
echo "=== E2E RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
