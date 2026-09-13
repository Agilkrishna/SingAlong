/**
 * Live E2E: chat messages must never carry duplicate ids (React key collision).
 * Simulates: A creates room → A & B join → B chats → A rejoins → everyone leaves.
 * Asserts on every snapshot / event: chat ids unique + UUID-shaped,
 * and each join appears exactly once.
 */
import { io, Socket } from 'socket.io-client'

const URL = 'http://localhost:3003'
const PATH = '/'
let failures = 0
const ok = (cond: boolean, msg: string) => {
  console.log((cond ? '  \u2713 ' : '  \u2717 ') + msg)
  if (!cond) failures++
}

function checkChat(label: string, chat: { id: string; text: string }[], expectJoins: number, expectLefts = 0) {
  const ids = chat.map((c) => c.id)
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
  ok(dupes.length === 0, `${label}: no duplicate chat ids (${chat.length} msgs)`)
  if (dupes.length) console.log('    dupes:', dupes.join(', '))
  const malformed = ids.filter((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  ok(malformed.length === 0, `${label}: all ids crypto-UUID shaped`)
  if (malformed.length) console.log('    malformed:', malformed.join(', '))
  const joins = chat.filter((c) => c.text.includes('joined the stage'))
  ok(joins.length === expectJoins, `${label}: ${expectJoins} join message(s) (got ${joins.length})`)
  const lefts = chat.filter((c) => c.text.includes('left the stage'))
  ok(lefts.length === expectLefts, `${label}: ${expectLefts} leave message(s) (got ${lefts.length})`)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // global watchdog — never hang
  const watchdog = setTimeout(() => {
    console.log('\nWATCHDOG TIMEOUT — test aborted')
    process.exit(1)
  }, 20000)

  const a: Socket = io(URL, { path: PATH, transports: ['websocket'], reconnection: false })
  const b: Socket = io(URL, { path: PATH, transports: ['websocket'], reconnection: false })
  for (const s of [a, b]) s.on('connect_error', (e: Error) => { console.log('connect_error:', e.message); process.exit(1) })
  await Promise.all([
    new Promise<void>((r) => a.on('connect', () => r())),
    new Promise<void>((r) => b.on('connect', () => r())),
  ])
  console.log('both sockets connected')

  const created = await new Promise<{ ok: boolean; roomId?: string }>((res) =>
    a.emit('create-room', { name: 'ChatDedup E2E', state: 'TestDedupState' }, res),
  )
  ok(created.ok && !!created.roomId, `create-room ok (${created.roomId})`)
  const roomId = created.roomId!

  const prof = { name: 'Alice', color: '#E50914' }
  const joinA = await new Promise<{ ok: boolean; room?: { chat: { id: string; text: string }[] } }>((res) =>
    a.emit('join-room', { roomId, state: 'TestDedupState', profile: prof, pid: 'p-alice', micOn: false, camOn: false }, res),
  )
  ok(joinA.ok, 'A joined')
  checkChat('after A join', joinA.room!.chat, 1)

  const joinB = await new Promise<{ ok: boolean; room?: { chat: { id: string; text: string }[] } }>((res) =>
    b.emit('join-room', { roomId, state: 'TestDedupState', profile: { name: 'Bob', color: '#1ABC9C' }, pid: 'p-bob', micOn: false, camOn: false }, res),
  )
  ok(joinB.ok, 'B joined')
  checkChat('after B join', joinB.room!.chat, 2)

  // B sends a user chat message; A must receive it incrementally
  const gotUserMsg = new Promise<{ id: string; text: string }>((res) =>
    a.on('chat', (d: { message: { id: string; text: string } }) => d.message.text === 'hello from Bob' && res(d.message)),
  )
  b.emit('chat', { text: 'hello from Bob' })
  const um = await Promise.race([gotUserMsg, wait(3000).then(() => null)])
  ok(!!um, 'user chat delivered to peer')

  // A rejoins (page-refresh flow) — snapshot re-delivered, must stay unique
  const rejoin = await new Promise<{ ok: boolean; room?: { chat: { id: string; text: string }[] } }>((res) =>
    a.emit('join-room', { roomId, state: 'TestDedupState', profile: prof, pid: 'p-alice', micOn: false, camOn: false }, res),
  )
  ok(rejoin.ok, 'A rejoined')
  // same-socket rejoin: server first runs leaveCurrentRoom ("Alice left the stage")
  // then admits her again ("Alice joined the stage") — distinct events, distinct ids
  checkChat('after A rejoin', rejoin.room!.chat, 3, 1)

  // cleanup: leave so the custom room is deleted
  a.emit('leave-room'); b.emit('leave-room')
  await wait(300)
  a.disconnect(); b.disconnect()

  console.log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\nFAILED: ${failures}`)
  clearTimeout(watchdog)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
