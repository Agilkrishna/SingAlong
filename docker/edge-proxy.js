// SingAlong — single-port edge router (Bun-native; replaces Caddy inside the image).
//
//   public :$PORT ──┬─ /socket.io/*  OR  ?XTransformPort=3003  →  realtime 127.0.0.1:3003
//                   └─ everything else                          →  next    127.0.0.1:3000
//
// HTTP is proxied per-request with fetch. WebSocket upgrades are accepted by
// Bun's own WebSocket server and relayed message-by-message to a dedicated
// upstream WebSocket per client (engine.io frames are app-level, so relaying
// text/binary frames is transparent — including the polling→websocket sid
// upgrade, whose query string is forwarded untouched).
//
// Why not a copied Caddy binary? Hardened runtimes (Render) refuse to exec
// executables carrying file capabilities / external static binaries — with
// Bun doing the proxying we only ever exec runtimes that the platform has
// already proven it can run.
'use strict';

const PORT = Number(process.env.PORT || 10000);
const NEXT_HOST = process.env.NEXT_INTERNAL_HOST || '127.0.0.1';
const NEXT_PORT = Number(process.env.NEXT_INTERNAL_PORT || 3000);
const REALTIME_HOST = process.env.REALTIME_HOST || '127.0.0.1';
const REALTIME_PORT = Number(process.env.REALTIME_PORT || 3003);

function isRealtime(url) {
  return (
    url.pathname.startsWith('/socket.io/') ||
    url.searchParams.get('XTransformPort') === '3003'
  );
}

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  idleTimeout: 0, // engine.io pings every 25 s; never GC idle sockets

  async fetch(req, srv) {
    const url = new URL(req.url);

    // ---- WebSocket upgrade → dedicated relay to the realtime service ----
    if (
      isRealtime(url) &&
      (req.headers.get('upgrade') || '').toLowerCase() === 'websocket'
    ) {
      const target = `ws://${REALTIME_HOST}:${REALTIME_PORT}${url.pathname}${url.search}`;
      const ok = srv.upgrade(req, {
        data: { target, backend: null, backlog: [], dead: false },
      });
      if (!ok) return new Response('upgrade failed', { status: 502 });
      return undefined; // socket hijacked by the websocket handler
    }

    // ---- plain HTTP (incl. socket.io long-polling) ----
    const rt = isRealtime(url);
    const host = rt ? REALTIME_HOST : NEXT_HOST;
    const port = rt ? REALTIME_PORT : NEXT_PORT;

    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.set('accept-encoding', 'identity'); // bodies stay uncompressed → lengths stay truthful
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const body = hasBody ? await req.arrayBuffer() : undefined;

    try {
      const upstream = await fetch(
        `http://${host}:${port}${url.pathname}${url.search}`,
        { method: req.method, headers, body, redirect: 'manual' }
      );
      return new Response(upstream.body, {
        status: upstream.status,
        headers: upstream.headers,
      });
    } catch (err) {
      return new Response(`edge: upstream ${host}:${port} unavailable\n`, {
        status: 502,
        headers: { 'content-type': 'text/plain', 'retry-after': '2' },
      });
    }
  },

  websocket: {
    open(ws) {
      const d = ws.data;
      const backend = new WebSocket(d.target);
      d.backend = backend;
      backend.onopen = () => {
        for (const m of d.backlog) {
          try { ws.send(m); } catch {}
        }
        d.backlog.length = 0;
      };
      backend.onmessage = (ev) => {
        if (d.dead) return;
        try { ws.send(ev.data); } catch {}
      };
      backend.onclose = (ev) => {
        if (d.dead) return;
        d.dead = true;
        try { ws.close(ev.code || 1000, ev.reason || ''); } catch {}
      };
      backend.onerror = () => {
        if (d.dead) return;
        d.dead = true;
        try { ws.close(1011, 'upstream error'); } catch {}
      };
    },
    message(ws, msg) {
      const d = ws.data;
      if (d.dead) return;
      if (d.backend && d.backend.readyState === WebSocket.OPEN) {
        try { d.backend.send(msg); } catch {}
      } else {
        d.backlog.push(msg); // backend still connecting — buffer, flush on open
      }
    },
    close(ws) {
      const d = ws.data;
      d.dead = true;
      if (d.backend) try { d.backend.close(); } catch {}
    },
    error(ws) {
      const d = ws.data;
      d.dead = true;
      if (d.backend) try { d.backend.close(); } catch {}
    },
  },
});

console.log(
  `▶ edge proxy on 0.0.0.0:${PORT} → next ${NEXT_HOST}:${NEXT_PORT} · realtime ${REALTIME_HOST}:${REALTIME_PORT}`
);
