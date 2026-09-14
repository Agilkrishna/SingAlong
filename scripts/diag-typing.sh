#!/usr/bin/env bash
# Micro-test: which typing action actually updates the React create-form input
set -u
pkill -9 -f "anthakshari-service" 2>/dev/null; pkill -f "edge-proxy.js" 2>/dev/null; sleep 0.5
for PORT_NO in 3003 3000; do
  for PID in $(ss -ltnp 2>/dev/null | grep ":$PORT_NO " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do
    kill -9 "$PID" 2>/dev/null
  done
done
sleep 0.7
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
echo "BOOT OK"
agent-browser open "http://localhost:8099" >/dev/null 2>&1
sleep 2
agent-browser find testid state-goa click >/dev/null 2>&1
sleep 4
echo -n "input present: "
agent-browser eval "!!document.querySelector('[data-testid=\"new-room-name\"]')" 2>/dev/null
echo "--- method 1: find testid type ---"
agent-browser find testid new-room-name type "Method One" 2>&1 | head -1
sleep 0.5
echo -n "value: "
agent-browser eval "document.querySelector('[data-testid=\"new-room-name\"]')?.value" 2>/dev/null
echo -n "create btn disabled: "
agent-browser eval "document.querySelector('[data-testid=\"create-room-btn\"]')?.disabled" 2>/dev/null
echo "--- method 2: fill by css selector ---"
agent-browser fill "[data-testid='new-room-name']" "Method Two" 2>&1 | head -1
sleep 0.5
echo -n "value: "
agent-browser eval "document.querySelector('[data-testid=\"new-room-name\"]')?.value" 2>/dev/null
echo -n "create btn disabled: "
agent-browser eval "document.querySelector('[data-testid=\"create-room-btn\"]')?.disabled" 2>/dev/null
echo "--- method 3: try creating a room with method 2 value ---"
agent-browser find testid create-room-btn click 2>&1 | head -1
sleep 2
echo -n "join dialog up (join-listener present): "
agent-browser eval "!!document.querySelector('[data-testid=\"join-listener\"]')" 2>/dev/null
agent-browser close >/dev/null 2>&1
echo "DIAG2 DONE"
