/**
 * E2E helper: join a state room and emit karaoke-load so the browser under
 * test shows the mini now-playing bar. Stays connected 6s, then leaves.
 * Usage: bun scripts/karaoke-load-e2e.ts <state> <videoId> <title>
 */
import { io } from 'socket.io-client'

const state = process.argv[2] ?? 'Goa'
const videoId = process.argv[3] ?? 'jfKfPfyJRdk'
const title = process.argv[4] ?? 'E2E Test Track'
const roomId = `state:${state.toLowerCase().replace(/\s+/g, '-')}`

const s = io('http://localhost:3003', { path: '/', transports: ['websocket'] })
const bail = (msg: string, code = 1) => {
  console.error(msg)
  s.disconnect()
  process.exit(code)
}
s.on('connect_error', (e) => bail('connect_error: ' + e.message))
setTimeout(() => bail('watchdog: join ack never arrived'), 8000)

s.on('connect', () => {
  s.emit(
    'join-room',
    { roomId, state, profile: { name: 'DJ Bot', color: '#F5A623' }, pid: 'pid-djbot', micOn: false, camOn: false },
    (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) return bail('join failed: ' + (res?.error ?? 'unknown'))
      console.log('joined', roomId)
      s.emit('karaoke-load', { videoId, title })
      console.log('karaoke-load emitted:', videoId)
      setTimeout(() => {
        s.emit('leave-room')
        s.disconnect()
        console.log('done — DJ Bot left (karaoke state stays in the room)')
        process.exit(0)
      }, 6000)
    },
  )
})
