// Server-contract probe for the Task 18 feature pack.
// Asserts directly against the realtime service (:3003):
//   1. create-room accepts vibe tags (validated + capped at 3) and they land
//      in join snapshots, public listings
//   2. every room snapshot carries a non-empty daily icebreaker prompt
//   3. activities: listen / watch / end (hangout rooms return to 'chat')
//   4. karaoke engine still works alongside the new activities
//   5. host-mute: force-mute event + forcedMuted in snapshots + the service
//      COERCES the target's mic-on media-state back off
//   6. room-reaction broadcast reaches everyone; room-report acks
//   7. host-remove: target gets removed-from-room, room shrinks
//   8. 'sing' rooms are born on stage WITH their tags
// Run: bun scripts/socket-probe-features.mjs   (exit 0 = PROBE OK)
import { io } from 'socket.io-client'

const URL = process.env.PROBE_URL || 'http://127.0.0.1:3003'
let failed = false
const fail = (m) => { console.error('  ❌ ' + m); failed = true }
const ok = (m) => console.log('  ✅ ' + m)

const mk = () => io(URL, { path: '/', transports: ['websocket'], forceNew: true })
const A = mk()

const lastRoomState = {}
let reactionsSeen = 0

A.on('room-state', ({ room }) => { if (room?.id) lastRoomState[room.id] = room })
A.on('room-reaction', () => { reactionsSeen += 1 })
A.on('karaoke-state', ({ karaoke }) => {
  if (karaoke?.videoId === 'dQw4w9WgXcQ') ok('karaoke engine works beside new activities')
})

A.on('connect', () => {
  // 1+2 — create a hangout room with tags (one bogus slug must be dropped)
  A.emit(
    'create-room',
    { name: 'Vibe Check', state: 'Goa', kind: 'hangout', tags: ['retro', 'chai-time', 'late-night', 'totally-bogus'] },
    (res) => {
      if (!res?.ok || !res.roomId) return fail('create room with tags: ' + (res?.error ?? 'no ack'))
      ok('created room with tags ' + res.roomId)
      const roomId = res.roomId

      A.emit(
        'join-room',
        { roomId, state: 'Goa', profile: { name: 'ProbeHost', color: '#E50914' }, pid: 'pf-host', micOn: false, camOn: false },
        (j) => {
          if (!j?.ok) return fail('join: ' + (j?.error ?? 'no ack'))
          const snap = j.room
          const tags = snap?.tags ?? []
          if (tags.length === 3 && !tags.includes('totally-bogus') && tags.includes('retro'))
            ok('tags validated (bogus dropped, max 3 kept): ' + tags.join(','))
          else fail(`tags wrong: [${tags.join(',')}]`)
          if (typeof snap?.prompt === 'string' && snap.prompt.length > 5) ok('daily icebreaker prompt present: "' + snap.prompt.slice(0, 34) + '…"')
          else fail('prompt missing/empty in snapshot')

          // 3 — activities listen → watch → end
          A.emit('activity-start', { kind: 'listen' }, (r1) => {
            if (!r1?.ok) return fail('activity-start listen failed')
            const a1 = lastRoomState[roomId]?.activity
            if (a1 === 'listen') ok('Listen Together activity live')
            else fail(`activity after listen-start = '${a1}' (want 'listen')`)

            A.emit('activity-start', { kind: 'watch' }, (r2) => {
              if (!r2?.ok) return fail('activity-start watch failed')
              const a2 = lastRoomState[roomId]?.activity
              if (a2 === 'watch') ok('Watch Party activity live (switch-over works)')
              else fail(`activity after watch-start = '${a2}' (want 'watch')`)

              // 4 — karaoke still loadable in a media activity
              A.emit('karaoke-load', { videoId: 'dQw4w9WgXcQ', title: 'Contract Probe' }, () => {})

              A.emit('activity-end', (r3) => {
                if (!r3?.ok) return fail('activity-end failed')
                const a3 = lastRoomState[roomId]?.activity
                if (a3 === 'chat') ok('activity-end returns the room to the hangout')
                else fail(`activity after end = '${a3}' (want 'chat')`)

                // 5-7 — second socket joins; host powers on it
                const B = mk()
                B.on('connect', () => {
                  let bForceMuted = false
                  let bRemovedMsg = ''
                  B.on('force-mute', ({ muted }) => { if (muted) bForceMuted = true })
                  B.on('removed-from-room', ({ message }) => { bRemovedMsg = message || 'removed' })

                  B.emit(
                    'join-room',
                    { roomId, state: 'Goa', profile: { name: 'ProbeBot', color: '#F5A623' }, pid: 'pf-bot', micOn: true, camOn: false },
                    (jb) => {
                      if (!jb?.ok) return fail('probe bot join: ' + (jb?.error ?? 'no ack'))
                      const botId = B.id

                      A.emit('host-mute', { targetId: botId, muted: true }, (hm) => {
                        if (!hm?.ok) return fail('host-mute: ' + (hm?.error ?? 'no ack'))
                        setTimeout(() => {
                          if (bForceMuted) ok('force-mute event delivered to the target')
                          else fail('target never received force-mute')
                          const botSnap = (lastRoomState[roomId]?.participants ?? []).find((p) => p.id === botId)
                          if (botSnap?.forcedMuted) ok('forcedMuted flag visible in the room snapshot')
                          else fail('forcedMuted missing from snapshot')

                          // the coercion: bot tries to unmute itself
                          B.emit('media-state', { micOn: true, camOn: false }, () => {})
                          setTimeout(() => {
                            const bot2 = (lastRoomState[roomId]?.participants ?? []).find((p) => p.id === botId)
                            if (bot2 && bot2.micOn === false) ok('service COERCES mic-on back off while host-muted')
                            else fail(`media-state coercion failed (micOn=${bot2?.micOn})`)

                            // 6 — reactions + report
                            A.emit('room-reaction', { kind: 'heart' }, (rr) => {
                              if (!rr?.ok) return fail('room-reaction ack failed')
                              B.emit('room-report', { reason: 'contract probe' }, (rep) => {
                                if (!rep?.ok) return fail('room-report ack failed')
                                ok('room-report accepted (logged server-side)')
                                setTimeout(() => {
                                  if (reactionsSeen >= 1) ok('room-reaction broadcast reaches the room')
                                  else fail('no room-reaction received')

                                  // 7 — host-remove
                                  A.emit('host-remove', { targetId: botId }, (hr) => {
                                    if (!hr?.ok) return fail('host-remove: ' + (hr?.error ?? 'no ack'))
                                    setTimeout(() => {
                                      if (bRemovedMsg) ok('removed-from-room delivered: "' + bRemovedMsg.slice(0, 40) + '…"')
                                      else fail('target never received removed-from-room')
                                      const count = (lastRoomState[roomId]?.participants ?? []).length
                                      if (count === 1) ok('room shrinks back to 1 after host-remove')
                                      else fail(`participant count after remove = ${count}`)

                                      // lobby listing carries tags too — must be checked
                                      // BEFORE A leaves (empty rooms are lobby-hidden)
                                      A.emit('list-rooms', { state: 'Goa' }, (list) => {
                                        const listed = (list ?? []).find((r) => r.id === roomId)
                                        if (listed && Array.isArray(listed.tags) && listed.tags.length === 3)
                                          ok('public room list carries tags for the lobby')
                                        else fail('listed room missing tags')

                                        // 8 — singing rooms are born on stage WITH tags
                                        A.emit(
                                          'create-room',
                                          { name: 'Tagged Sangeet', state: 'Goa', kind: 'sing', tags: ['devotional'] },
                                          (cs) => {
                                            if (!cs?.ok || !cs.roomId) return fail('create sing room with tags: ' + (cs?.error ?? 'no ack'))
                                            A.emit(
                                              'join-room',
                                              { roomId: cs.roomId, state: 'Goa', profile: { name: 'ProbeHost', color: '#E50914' }, pid: 'pf-host', micOn: false, camOn: false },
                                              (js) => {
                                                if (!js?.ok) return fail('join sing room: ' + (js?.error ?? 'no ack'))
                                                if (js.room?.activity === 'sing' && js.room?.kind === 'sing')
                                                  ok('singing room born on stage (kind=sing, activity=sing)')
                                                else fail(`sing room kind='${js.room?.kind}' activity='${js.room?.activity}'`)
                                                if ((js.room?.tags ?? []).includes('devotional'))
                                                  ok('singing room carries its vibe tags')
                                                else fail('sing room tags missing')
                                                B.close()
                                                A.emit('leave-room')
                                                setTimeout(() => { A.close(); console.log(failed ? 'PROBE: FAIL' : 'PROBE: OK'); process.exit(failed ? 1 : 0) }, 400)
                                              },
                                            )
                                          },
                                        )
                                      })
                                    }, 600)
                                  })
                                }, 500)
                              })
                            })
                          }, 600)
                        }, 600)
                      })
                    },
                  )
                  B.on('connect_error', (e) => { fail('bot connect_error: ' + e.message); process.exit(1) })
                })
              })
            })
          })
        },
      )
    },
  )
})

A.on('connect_error', (e) => { console.error('  ❌ connect_error: ' + e.message); process.exit(1) })
setTimeout(() => { console.error('  ❌ PROBE timeout'); process.exit(1) }, 25000)
