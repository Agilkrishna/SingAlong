// Browser-companion probe for the Task 18 host-control E2E.
// Usage: bun scripts/socket-probe-host.mjs <roomCode> <outFile> [occupy]
//   normal mode: joins the room as "ProbeBot2", sends one chat message after
//                1.2s, then waits. Writes status lines to <outFile>:
//                PROBE-JOINED · PROBE-CHAT-SENT · PROBE-FORCE-MUTED · PROBE-REMOVED
//                Exits 0 as soon as PROBE-REMOVED happens (or after 90s).
//   occupy mode: joins and just idles (keeps the room non-empty for lobby
//                assertions); exits 0 after 30s.
import { io } from 'socket.io-client'
import { appendFileSync } from 'node:fs'

const [roomCode, outFile, mode] = process.argv.slice(2)
if (!roomCode || !outFile) {
  console.error('usage: socket-probe-host.mjs <roomCode> <outFile> [occupy]')
  process.exit(1)
}
const URL = process.env.PROBE_URL || 'http://127.0.0.1:3003'
const socket = io(URL, { path: '/', transports: ['websocket'], forceNew: true })
const mark = (m) => appendFileSync(outFile, m + '\n')

socket.on('connect', () => {
  socket.emit(
    'join-room',
    {
      roomId: roomCode,
      state: 'Goa',
      profile: { name: 'ProbeBot2', color: '#F5A623' },
      pid: 'probe-bot-2-' + Date.now(),
      micOn: false,
      camOn: false,
    },
    (res) => {
      if (!res?.ok) {
        console.error('  ❌ join failed: ' + (res?.error ?? 'no ack'))
        process.exit(1)
      }
      mark('PROBE-JOINED')
      if (mode === 'occupy') {
        setTimeout(() => process.exit(0), 30000)
        return
      }
      setTimeout(() => {
        socket.emit('chat', { text: 'hello from probe' })
        mark('PROBE-CHAT-SENT')
      }, 1200)
    },
  )
})

socket.on('force-mute', ({ muted }) => {
  if (muted) mark('PROBE-FORCE-MUTED')
})
socket.on('removed-from-room', () => {
  mark('PROBE-REMOVED')
  setTimeout(() => process.exit(0), 200)
})
socket.on('connect_error', (e) => {
  console.error('  ❌ connect_error: ' + e.message)
  process.exit(1)
})
setTimeout(() => {
  console.error('  ❌ probe timeout (no removal)')
  process.exit(1)
}, 90000)
