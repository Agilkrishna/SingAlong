// Server-contract probe for the singing-rooms feature (Task 17).
// Creates one 'sing' room + one 'hangout' room in Kerala directly on the
// realtime service (:3003), occupies them with two sockets, and asserts:
//   1. sing-room snapshot: kind='sing' AND activity='sing' (born on stage)
//   2. an EMPTY custom room is hidden from list-rooms (grace-period rule)
//   3. once occupied: sing room lists kind='sing', hangout room kind='hangout'
//   4. the default state room is always kind='hangout'
// Run: bun scripts/socket-probe.mjs   (exit 0 = PROBE OK)
import { io } from 'socket.io-client'

const URL = process.env.PROBE_URL || 'http://127.0.0.1:3003'
const socket = io(URL, { path: '/', transports: ['websocket'], forceNew: true })
let failed = false
const fail = (m) => { console.error('  ❌ ' + m); failed = true }
const ok = (m) => console.log('  ✅ ' + m)

socket.on('connect', () => {
  socket.emit('create-room', { name: 'Probe Sing Room', state: 'Kerala', kind: 'sing' }, (res) => {
    if (!res?.ok || !res.roomId) return fail('create sing room: ' + (res?.error ?? 'no ack'))
    ok('created singing room ' + res.roomId)
    const singId = res.roomId
    socket.emit('create-room', { name: 'Probe Hangout Room', state: 'Kerala' }, (res2) => {
      if (!res2?.ok || !res2.roomId) return fail('create hangout room: ' + (res2?.error ?? 'no ack'))
      ok('created hangout room ' + res2.roomId + ' (no kind sent → default)')
      const hangId = res2.roomId
      socket.emit(
        'join-room',
        { roomId: singId, state: 'Kerala', profile: { name: 'ProbeBot', color: '#E50914' }, pid: 'probe-bot-1', micOn: false, camOn: false },
        (j) => {
          if (!j?.ok) return fail('join sing room: ' + (j?.error ?? 'no ack'))
          if (j.room?.kind !== 'sing') fail(`sing snapshot kind='${j.room?.kind}' (want 'sing')`)
          else ok('sing room snapshot kind=sing')
          if (j.room?.activity !== 'sing') fail(`sing snapshot activity='${j.room?.activity}' (want 'sing' — born on stage)`)
          else ok('sing room snapshot activity=sing (opens on stage)')

          // grace-period invariant: a freshly created, still-empty room is
          // hidden from the lobby even though it exists in memory
          socket.emit('list-rooms', { state: 'Kerala' }, (rooms) => {
            if (!Array.isArray(rooms)) return fail('list-rooms: not an array')
            if (rooms.find((r) => r.id === hangId)) fail('EMPTY hangout room is visible in list-rooms (should be hidden)')
            else ok('empty hangout room correctly hidden from the lobby')

            // occupy the hangout room with a second socket, then re-list
            const s2 = io(URL, { path: '/', transports: ['websocket'], forceNew: true })
            s2.on('connect', () => {
              s2.emit(
                'join-room',
                { roomId: hangId, state: 'Kerala', profile: { name: 'ProbeBot2', color: '#F5A623' }, pid: 'probe-bot-2', micOn: false, camOn: false },
                (j2) => {
                  if (!j2?.ok) return fail('join hangout room: ' + (j2?.error ?? 'no ack'))
                  socket.emit('list-rooms', { state: 'Kerala' }, (rooms2) => {
                    if (!Array.isArray(rooms2)) return fail('list-rooms #2: not an array')
                    const sing = rooms2.find((r) => r.id === singId)
                    const hang = rooms2.find((r) => r.id === hangId)
                    const def = rooms2.find((r) => r.isDefault)
                    if (!sing) fail('occupied sing room missing from list-rooms')
                    else if (sing.kind !== 'sing') fail(`listed sing kind='${sing.kind}'`)
                    else ok('list-rooms: singing room carries kind=sing')
                    if (!hang) fail('occupied hangout room missing from list-rooms')
                    else if (hang.kind !== 'hangout') fail(`listed hangout kind='${hang.kind}'`)
                    else ok('list-rooms: hangout room carries kind=hangout')
                    if (def && def.kind !== 'hangout') fail(`default room kind='${def.kind}' (want 'hangout')`)
                    else ok('default state room is kind=hangout')
                    s2.emit('leave-room')
                    socket.emit('leave-room')
                    setTimeout(() => {
                      s2.close()
                      socket.close()
                      console.log(failed ? 'PROBE: FAIL' : 'PROBE: OK')
                      process.exit(failed ? 1 : 0)
                    }, 400)
                  })
                },
              )
            })
            s2.on('connect_error', (e) => { fail('socket2 connect_error: ' + e.message); process.exit(1) })
          })
        },
      )
    })
  })
})

socket.on('connect_error', (e) => { console.error('  ❌ connect_error: ' + e.message); process.exit(1) })
setTimeout(() => { console.error('  ❌ PROBE timeout'); process.exit(1) }, 12000)
