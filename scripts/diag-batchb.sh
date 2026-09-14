#!/usr/bin/env bash
# Focused diagnosis for the two batch-B E2E failures:
#   A) avatar-8 aria-pressed not flipping
#   B) [10] create form "New room name" not found after leave->recap->kind-sing
set -u
pkill -9 -f "anthakshari-service" 2>/dev/null; pkill -f "edge-proxy.js" 2>/dev/null; sleep 0.5
for PORT_NO in 3003 3000; do
  for PID in $(ss -ltnp 2>/dev/null | grep ":$PORT_NO " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do
    kill -9 "$PID" 2>/dev/null
  done
done
sleep 0.7
ss -ltn 2>/dev/null | grep -q ":3003 " && { echo "ABORT: :3003 occupied"; exit 1; }
setsid nohup bun /home/z/my-project/mini-services/anthakshari-service/index.ts >/home/z/my-project/scripts/realtime.log 2>&1 &
mkdir -p /home/z/my-project/.next/standalone/.next
rm -rf /home/z/my-project/.next/standalone/.next/static
cp -r /home/z/my-project/.next/static /home/z/my-project/.next/standalone/.next/static
rm -rf /home/z/my-project/.next/standalone/public
cp -r /home/z/my-project/public /home/z/my-project/.next/standalone/public
setsid nohup bun /home/z/my-project/.next/standalone/server.js >/home/z/my-project/scripts/next-3000.log 2>&1 &
for i in $(seq 1 30); do curl -sf -o /dev/null --max-time 2 http://127.0.0.1:3000/ && break; sleep 0.5; done
PORT=8099 setsid nohup bun /home/z/my-project/docker/edge-proxy.js >/home/z/my-project/scripts/edge-8099.log 2>&1 &
for i in $(seq 1 20); do curl -sf -o /dev/null --max-time 2 http://localhost:8099/ && break; sleep 0.5; done
grep -q "DesiHangout realtime service running" /home/z/my-project/scripts/realtime.log || { echo "ABORT: service boot"; tail -3 /home/z/my-project/scripts/realtime.log; exit 1; }
echo "BOOT OK"

agent-browser open "http://localhost:8099" >/dev/null 2>&1
sleep 2
agent-browser find testid state-goa click >/dev/null 2>&1
sleep 5

echo "=== A) avatar diagnostics ==="
agent-browser find testid join-featured click >/dev/null 2>&1
sleep 1.5
echo -n "avatar-8 count: "
agent-browser eval "document.querySelectorAll('[data-testid=\"avatar-8\"]').length" 2>/dev/null
echo -n "before click aria-pressed: "
agent-browser eval "document.querySelector('[data-testid=\"avatar-8\"]')?.getAttribute('aria-pressed')" 2>/dev/null
echo -n "profile in LS before: "
agent-browser eval "localStorage.getItem('singalong-profile')" 2>/dev/null | head -c 200; echo ""
echo -n "click result: "
agent-browser find testid avatar-8 click 2>&1 | head -2
sleep 0.6
echo -n "after click aria-pressed: "
agent-browser eval "document.querySelector('[data-testid=\"avatar-8\"]')?.getAttribute('aria-pressed')" 2>/dev/null
echo -n "profile in LS after: "
agent-browser eval "localStorage.getItem('singalong-profile')" 2>/dev/null | head -c 200; echo ""
echo -n "page errors: "
agent-browser eval "window.__errs ?? 'none-tracked'" 2>/dev/null

echo "=== B) leave->recap->kind-sing diagnostics ==="
agent-browser find testid join-listener click >/dev/null 2>&1
sleep 2.5
agent-browser find testid leave-room click >/dev/null 2>&1
sleep 0.6
agent-browser find testid leave-confirm-action click >/dev/null 2>&1
sleep 2.5
echo -n "recap dialog present: "
agent-browser eval "!!document.querySelector('[data-testid=\"recap-dialog\"]')" 2>/dev/null
agent-browser find testid recap-close click >/dev/null 2>&1
sleep 1
echo -n "view after close (lobby marker 'Open your own' present): "
agent-browser eval "document.body.textContent.includes('Open your own')" 2>/dev/null
agent-browser press Escape >/dev/null 2>&1
agent-browser find testid create-kind-sing click 2>&1 | head -2
sleep 0.8
echo -n "create input present: "
agent-browser eval "!!document.querySelector('input[aria-label=\"New room name\"]')" 2>/dev/null
echo -n "input aria-label now: "
agent-browser eval "document.querySelector('[data-testid=\"create-room-btn\"]') ? 'btn-there' : 'no-btn'" 2>/dev/null
echo -n "snapshot textbox lines: "
agent-browser snapshot -i 2>/dev/null | rg -c 'textbox' || echo 0
echo "snapshot textbox sample:"
agent-browser snapshot -i 2>/dev/null | rg 'textbox' | head -5
agent-browser close >/dev/null 2>&1
echo "DIAG DONE"
