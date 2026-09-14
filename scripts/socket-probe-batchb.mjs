// Server-contract probe for Task 19 (batch B features).
// Asserts directly against the realtime service (:3003):
//   1. avatars ride the join payload → snapshot + chat messages
//   2. passcode rooms: wrong/missing code refused, correct code joins,
//      listings expose `locked` (never the code itself)
//   3. scheduled rooms appear in list-rooms while EMPTY, with scheduleAt
//   4. quiz: start → question phase (answer hidden) → answer counting →
//      reveal (correct exposed)
//   5. prompts: truth → next → end
//   6. antakshari: refused in hangouts; in sing rooms start → letter →
//      done awards +10 and advances the letter from the song's last letter
//   7. rejoin grace: an abruptly dropped socket keeps its seat (seen by an
//      in-room observer) and a same-pid rejoin silently resumes it
//   8. latency-ping ack round-trip
// Run: bun scripts/socket-probe-batchb.mjs   (exit 0 = PROBE OK)
import { io } from 'socket.io-client'

const URL = process.env.PROBE_URL || 'http://127.0.0.1:3003'
let failed = false
const fail = (m) => { console.error('  ❌ ' + m); failed = true }
const ok = (m) => console.log('  ✅ ' + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const mk = () => io(URL, { path: '/', transports: ['websocket'], forceNew: true })
const A = mk()

const lastRoomState = {}
let activeRoomId = '' // the room A is currently joined to
let hostChatAvatar = null
let sawChatFromHost = false

A.on('room-state', ({ room }) => { if (room?.id) lastRoomState[room.id] = room })
A.on('chat', ({ message }) => {
  if (message?.name === 'ProbeHost' && message.type === 'user') {
    sawChatFromHost = true
    hostChatAvatar = message.avatar ?? null
  }
})

const join = (roomId, profile, pid, passcode) =>
  new Promise((resolve) => {
    A.emit(
      'join-room',
      { roomId, state: 'Goa', profile, pid, micOn: false, camOn: false, passcode },
      (j) => {
        if (j?.ok) activeRoomId = roomId
        resolve(j)
      },
    )
  })

A.on('connect', async () => {
  // hang-guard: never let the probe hang forever
  const guard = setTimeout(() => { fail('probe timed out'); finish() }, 90_000)
  try {
    // 1 — avatar rides along
    const created = await new Promise((resolve) => {
      A.emit('create-room', { name: 'Batch B HQ', state: 'Goa', kind: 'hangout' }, (res) => resolve(res))
    })
    if (!created?.ok) { fail('create room: ' + (created?.error ?? 'no ack')); return finish() }
    const hqRoomId = created.roomId
    const j1 = await join(hqRoomId, { name: 'ProbeHost', color: '#E50914', avatar: '🛺' }, 'pf-bb')
    if (!j1?.ok) { fail('join: ' + (j1?.error ?? 'no ack')); return finish() }
    const me = j1.room.participants.find((p) => p.name === 'ProbeHost')
    if (me?.avatar === '🛺') ok('avatar saved + echoed in snapshot (🛺)')
    else fail(`avatar missing in snapshot: ${JSON.stringify(me)}`)
    A.emit('chat', { text: 'avatar check' })
    await sleep(500)
    if (sawChatFromHost && hostChatAvatar === '🛺') ok('chat messages carry the avatar')
    else fail(`chat message missing avatar (got ${JSON.stringify(hostChatAvatar)}, saw=${sawChatFromHost})`)

    // 2 — passcode rooms
    const lockedRes = await new Promise((resolve) => {
      A.emit('create-room', { name: 'Secret Adda', state: 'Goa', kind: 'hangout', passcode: '424242' }, (res) => resolve(res))
    })
    if (!lockedRes?.ok) { fail('create locked room: ' + (lockedRes?.error ?? 'no ack')); return finish() }
    const lockedId = lockedRes.roomId
    A.emit(
      'join-room',
      { roomId: lockedId, state: 'Goa', profile: { name: 'Sneaker', color: '#E50914' }, pid: 'pf-sneak', micOn: false, camOn: false },
      (j) => {
        if (!j?.ok && /locked/i.test(j?.error ?? '')) ok('join without passcode refused')
        else fail('join without passcode should fail')
      },
    )
    A.emit(
      'join-room',
      { roomId: lockedId, state: 'Goa', profile: { name: 'Sneaker', color: '#E50914' }, pid: 'pf-sneak', micOn: false, camOn: false, passcode: '999999' },
      (j) => {
        if (!j?.ok && /locked/i.test(j?.error ?? '')) ok('wrong passcode refused')
        else fail('wrong passcode should fail')
      },
    )
    const keyJoin = await join(lockedId, { name: 'KeyMaster', color: '#2ECC71', avatar: '☕' }, 'pf-key', '424242')
    if (keyJoin?.ok) ok('correct passcode joins the locked room')
    else fail('correct passcode should join: ' + (keyJoin?.error ?? ''))
    // occupied + locked → the listing must expose locked=true (never the code)
    const listed = await new Promise((resolve) => {
      A.emit('list-rooms', { state: 'Goa' }, (list) => resolve(list))
    })
    const pub = (listed ?? []).find((r) => r.id === lockedId)
    if (pub?.locked === true) ok('occupied locked room listed with locked=true')
    else fail('locked flag missing from public listing: ' + JSON.stringify(pub ?? {}))
    if (!JSON.stringify(listed ?? []).includes('424242')) ok('passcode value never appears in listings')
    else fail('PASSCODE LEAKED into the room list!')

    // 3 — scheduled rooms stay visible while empty
    const in25min = Date.now() + 25 * 60 * 1000
    const schedRes = await new Promise((resolve) => {
      A.emit('create-room', { name: 'Antakshari Tonight', state: 'Goa', kind: 'sing', scheduleAt: in25min }, (res) => resolve(res))
    })
    if (!schedRes?.ok) { fail('create scheduled room: ' + (schedRes?.error ?? 'no ack')); return finish() }
    const schedId = schedRes.roomId
    const listed2 = await new Promise((resolve) => {
      A.emit('list-rooms', { state: 'Goa' }, (list) => resolve(list))
    })
    const pubSched = (listed2 ?? []).find((r) => r.id === schedId)
    if (pubSched && Math.abs(pubSched.scheduleAt - in25min) < 2000)
      ok('empty scheduled room is listed ("Starting soon") with scheduleAt')
    else fail('scheduled room missing from list-rooms while empty')

    // back to HQ for the party games
    const back = await join(hqRoomId, { name: 'ProbeHost', color: '#E50914', avatar: '🛺' }, 'pf-bb')
    if (!back?.ok) { fail('rejoin HQ: ' + (back?.error ?? '')); return finish() }

    // 4 — quiz engine (in HQ, where A is a participant)
    A.emit('quiz-start', (r) => {
      if (r?.ok) ok('quiz started')
      else fail('quiz-start: ' + (r?.error ?? ''))
    })
    await sleep(500)
    const quiz = lastRoomState[hqRoomId]?.quiz
    if (quiz && quiz.phase === 'question' && quiz.q && quiz.options?.length === 4 && quiz.correct === undefined)
      ok('quiz question live, correct answer NOT leaked')
    else fail('quiz question state wrong: ' + JSON.stringify(quiz ?? {}).slice(0, 120))
    A.emit('quiz-answer', { choice: 0 }, (r) => { if (!r?.ok) fail('quiz-answer: ' + (r?.error ?? '')) })
    await sleep(400)
    const quiz2 = lastRoomState[hqRoomId]?.quiz
    if (quiz2?.answersCount === 1) ok('quiz answer registered (answersCount=1)')
    else fail('quiz answersCount wrong: ' + quiz2?.answersCount)
    // wait out the 15s answer window → reveal
    await sleep(15600)
    const quiz3 = lastRoomState[hqRoomId]?.quiz
    if (quiz3?.phase === 'reveal' && typeof quiz3.correct === 'number')
      ok('quiz reveal after the timer (correct exposed, phase=reveal)')
    else fail('quiz did not reveal: ' + JSON.stringify(quiz3 ?? {}).slice(0, 120))

    // 5 — prompts
    A.emit('prompts-start', { mode: 'truth' }, (r) => { if (!r?.ok) fail('prompts-start: ' + (r?.error ?? '')) })
    await sleep(400)
    const pr = lastRoomState[hqRoomId]?.prompts
    if (pr?.mode === 'truth' && pr.text && pr.target) ok('truth prompt live: "' + pr.text.slice(0, 40) + '…"')
    else fail('prompts state wrong')
    A.emit('prompts-next', (r) => { if (!r?.ok) fail('prompts-next: ' + (r?.error ?? '')) })
    await sleep(400)
    const pr2 = lastRoomState[hqRoomId]?.prompts
    if (pr2?.text) ok('prompts-next spun a new prompt')
    else fail('prompts-next failed')
    A.emit('prompts-end', () => {})
    await sleep(300)
    if (!lastRoomState[hqRoomId]?.prompts) ok('prompts-end cleared the game')
    else fail('prompts-end did not clear')

    // 6 — antakshari: refused in a plain hangout, welcomed on the stage
    A.emit('antakshari-start', (r0) => {
      if (r0?.ok) fail('antakshari-start should refuse in a plain hangout')
      else ok('antakshari refused outside the Sing Along activity')
      A.emit(
        'create-room',
        { name: 'Letter Battle', state: 'Goa', kind: 'sing' },
        (res) => {
          if (!res?.ok) { fail('create sing room: ' + (res?.error ?? '')); return }
          const singId = res.roomId
          join(singId, { name: 'SoloSinger', color: '#F5A623' }, 'pf-antak').then((j) => {
            if (!j?.ok) { fail('join sing room: ' + (j?.error ?? '')); return }
            A.emit('antakshari-start', (r) => {
              if (r?.ok) ok('antakshari started in the sing room')
              else fail('antakshari-start in sing room: ' + (r?.error ?? ''))
            })
          })
        },
      )
    })
    await sleep(900)
    const singRoomId = Object.keys(lastRoomState).find((id) => lastRoomState[id]?.name === 'Letter Battle')
    const antak = singRoomId ? lastRoomState[singRoomId]?.antakshari : null
    if (antak && /^[A-Z]$/.test(antak.letter) && antak.players?.includes('SoloSinger') && antak.endsAt > Date.now())
      ok(`antakshari live: letter ${antak.letter}, turn timer armed`)
    else fail('antakshari state wrong: ' + JSON.stringify(antak ?? {}).slice(0, 120))
    A.emit('antakshari-done', { song: 'Kaho Naa Pyaar Hai' }, (r) => {
      if (r?.ok) ok('antakshari-done accepted (+10)')
      else fail('antakshari-done: ' + (r?.error ?? ''))
    })
    await sleep(500)
    const antak2 = lastRoomState[singRoomId]?.antakshari
    if (antak2?.scores?.SoloSinger === 10) ok('antakshari scoring works (SoloSinger = 10)')
    else fail('antakshari scores wrong: ' + JSON.stringify(antak2?.scores ?? {}))
    if (antak2 && /^[A-Z]$/.test(antak2.letter) && antak2.letter !== antak?.letter)
      ok(`letter advanced from the song (now ${antak2.letter})`)
    else fail('letter did not advance: ' + antak2?.letter)
    A.emit('antakshari-end', () => {})
    await sleep(300)
    if (!lastRoomState[singRoomId]?.antakshari) ok('antakshari-end cleared the game')
    else fail('antakshari-end did not clear')

    // 7 — rejoin grace: A watches HQ while FlakyFriend blips and rejoins.
    // A must be IN HQ to see its broadcasts — rejoin HQ first.
    await join(hqRoomId, { name: 'ProbeHost', color: '#E50914', avatar: '🛺' }, 'pf-bb')
    const B = mk()
    B.on('connect', () => {
      B.emit(
        'join-room',
        { roomId: hqRoomId, state: 'Goa', profile: { name: 'FlakyFriend', color: '#00BCD4' }, pid: 'pf-flaky', micOn: false, camOn: false },
        (j) => {
          if (!j?.ok) { fail('flaky join: ' + (j?.error ?? '')); return finish() }
          const joinedAt = j.room.participants.find((p) => p.name === 'FlakyFriend')?.joinedAt
          B.disconnect() // network blip!
          setTimeout(() => {
            const snap = lastRoomState[hqRoomId]
            const stillThere = snap?.participants?.some((p) => p.name === 'FlakyFriend')
            if (stillThere) ok('dropped socket kept the seat inside the grace window')
            else fail('FlakyFriend was removed immediately on disconnect')
            const B2 = mk()
            B2.on('connect', () => {
              B2.emit(
                'join-room',
                { roomId: hqRoomId, state: 'Goa', profile: { name: 'FlakyFriend', color: '#00BCD4', avatar: '🦁' }, pid: 'pf-flaky', micOn: false, camOn: false },
                (j2) => {
                  if (!j2?.ok) { fail('rejoin after blip: ' + (j2?.error ?? '')); return finish() }
                  const me2 = j2.room.participants.find((p) => p.name === 'FlakyFriend')
                  if (me2 && joinedAt && me2.joinedAt === joinedAt)
                    ok('silent auto-rejoin resumed the SAME seat (joinedAt preserved)')
                  else fail('rejoin lost the original seat: ' + JSON.stringify(me2))
                  B2.disconnect()
                  finish()
                },
              )
            })
          }, 1200)
        },
      )
    })
  } catch (e) {
    fail('probe crashed: ' + e?.message)
    finish()
  }
})

function finish() {
  if (finish.done) return
  finish.done = true
  // 8 — latency probe
  const t0 = Date.now()
  A.emit('latency-ping', () => {
    if (Date.now() - t0 < 5000) ok('latency-ping ack round-trip works')
    else fail('latency-ping ack too slow')
    A.disconnect()
    console.log(failed ? 'PROBE: FAIL' : 'PROBE: OK')
    process.exit(failed ? 1 : 0)
  })
}
