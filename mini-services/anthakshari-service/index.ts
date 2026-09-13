/**
 * SingAlong — Realtime Service
 * -----------------------------
 * Socket.io mini-service (port 3003) handling:
 *  - State-based rooms (location rooms for every Indian State / UT)
 *  - Anonymous profiles with persistent ids + unique-name enforcement
 *  - WebRTC mesh signaling relay (offer / answer / ICE)
 *  - The "Main Seat": one singer performs, everyone else cheers them with
 *    animated poppers (+10 pts) and hearts (+100 pts) — no rounds, no
 *    competition, just a jam room.
 *  - Shared YouTube karaoke player state (load / play / pause / seek / queue)
 *  - Room chat
 *
 * Live state is kept in memory. Applause points are batched (3s) and POSTed
 * to the Next.js API (port 3000) which persists them with Prisma for the
 * home-page leaderboard.
 */

import { createServer } from 'http'
import { Server, Socket } from 'socket.io'

const PORT = 3003
const MAX_PARTICIPANTS = 8
const CHAT_HISTORY = 60
const MAX_KARAOKE_QUEUE = 30
const AWARD_COOLDOWN_MS = 600
const POINTS_FLUSH_MS = 3000

const POPPER_POINTS = 10
const HEART_POINTS = 100

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

/* ---------------------------------- types --------------------------------- */

interface Profile {
  name: string
  color: string
}

interface Participant {
  id: string
  /** stable anonymous id stored in the user's browser (localStorage) */
  pid: string
  name: string
  color: string
  micOn: boolean
  camOn: boolean
  isHost: boolean
  joinedAt: number
}

interface ChatMessage {
  id: string
  type: 'user' | 'system'
  from?: string
  name?: string
  color?: string
  text: string
  at: number
}

interface Stage {
  singerId: string
  singerName: string
  singerColor: string
  since: number
  /** applause points earned during this seat session */
  points: number
  poppers: number
  hearts: number
}

interface QueueItem {
  videoId: string
  title: string
  by: string
  byName: string
}

interface Karaoke {
  videoId: string
  title: string
  playing: boolean
  positionAt: number
  updatedAt: number
  by: string
  byName: string
  queue: QueueItem[]
}

interface Room {
  id: string
  name: string
  state: string
  hostId: string
  createdAt: number
  isDefault: boolean
  participants: Map<string, Participant>
  stage: Stage | null
  chat: ChatMessage[]
  karaoke: Karaoke | null
  karaokeEndedAt: number
}

interface JoinPayload {
  roomId: string
  state: string
  profile: Profile
  pid: string
  micOn: boolean
  camOn: boolean
}

interface ApplauseEvent {
  id: string
  kind: 'popper' | 'heart'
  points: number
  by: string
  byName: string
  singerId: string
  singerName: string
  stage: { points: number; poppers: number; hearts: number }
  at: number
}

/* -------------------------------- helpers --------------------------------- */

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomCode = (len = 5) =>
  Array.from({ length: len }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')

const msgId = () => Math.random().toString(36).slice(2, 11)

const AVATAR_COLORS = ['#E50914', '#F5A623', '#2ECC71', '#1ABC9C', '#9B59B6', '#E91E63', '#F39C12', '#00BCD4', '#8BC34A', '#FF5722']

const rooms = new Map<string, Room>()

/** each state always has one featured "always-on" room */
const defaultRoomId = (state: string) => `state:${state.toLowerCase().replace(/\s+/g, '-')}`

function ensureDefaultRoom(state: string): Room {
  const id = defaultRoomId(state)
  let room = rooms.get(id)
  if (!room) {
    room = {
      id,
      name: `${state} Singers`,
      state,
      hostId: '',
      createdAt: Date.now(),
      isDefault: true,
      participants: new Map(),
      ...defaultRoomObjects(),
    }
    rooms.set(id, room)
  }
  return room
}

function publicRoom(room: Room) {
  return {
    id: room.id,
    name: room.name,
    state: room.state,
    count: room.participants.size,
    live: !!room.stage,
    isDefault: room.isDefault,
  }
}

function roomSnapshot(room: Room) {
  return {
    id: room.id,
    name: room.name,
    state: room.state,
    hostId: room.hostId,
    participants: Array.from(room.participants.values())
      .sort((a, b) => a.joinedAt - b.joinedAt)
      // pid never leaves the server — it is only used for rejoin matching
      .map(({ pid, ...p }) => p),
    stage: room.stage,
    chat: room.chat.slice(-CHAT_HISTORY),
    karaoke: room.karaoke,
  }
}

function sysMsg(room: Room, text: string) {
  const m: ChatMessage = { id: msgId(), type: 'system', text, at: Date.now() }
  room.chat.push(m)
  if (room.chat.length > CHAT_HISTORY * 2) room.chat = room.chat.slice(-CHAT_HISTORY)
  return m
}

function broadcastRoom(room: Room) {
  io.to(room.id).emit('room-state', { room: roomSnapshot(room) })
}

function broadcastKaraoke(room: Room) {
  if (!room.karaoke) return
  io.to(room.id).emit('karaoke-state', {
    karaoke: { ...room.karaoke, serverNow: Date.now() },
  })
}

const validVideoId = (id: string) => /^[\w-]{6,24}$/.test(id)

function defaultRoomObjects() {
  return { stage: null as Stage | null, chat: [] as ChatMessage[], karaoke: null as Karaoke | null, karaokeEndedAt: 0 }
}

function roomListForState(state: string) {
  const list = Array.from(rooms.values()).filter(
    (r) => r.state.toLowerCase() === state.toLowerCase() && r.participants.size > 0,
  )
  const def = ensureDefaultRoom(state)
  if (!list.find((r) => r.id === def.id)) list.unshift(def)
  return list.map(publicRoom)
}

/* ------------------------- leaderboard point queue ------------------------ */

interface PendingScore {
  name: string
  state: string
  points: number
  poppers: number
  hearts: number
  performances: number
}

const pendingScores = new Map<string, PendingScore>()

function queueScore(
  name: string,
  state: string,
  delta: { points?: number; poppers?: number; hearts?: number; performances?: number },
) {
  const key = name.toLowerCase()
  const cur =
    pendingScores.get(key) ?? { name, state, points: 0, poppers: 0, hearts: 0, performances: 0 }
  cur.points += delta.points ?? 0
  cur.poppers += delta.poppers ?? 0
  cur.hearts += delta.hearts ?? 0
  cur.performances += delta.performances ?? 0
  if (state) cur.state = state
  pendingScores.set(key, cur)
}

function flushScores() {
  if (pendingScores.size === 0) return
  const updates = Array.from(pendingScores.values()).filter(
    (u) => u.points || u.poppers || u.hearts || u.performances,
  )
  pendingScores.clear()
  if (!updates.length) return

  fetch('http://localhost:3000/api/points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  }).catch((e) => {
    console.error('points flush failed:', e)
    // put the points back so they are not lost
    updates.forEach((u) =>
      queueScore(u.name, u.state, {
        points: u.points,
        poppers: u.poppers,
        hearts: u.hearts,
        performances: u.performances,
      }),
    )
  })
}

setInterval(flushScores, POINTS_FLUSH_MS)

/* ------------------------------ socket layer ------------------------------ */

io.on('connection', (socket: Socket) => {
  console.log(`socket connected: ${socket.id}`)
  let joinedRoom: Room | null = null
  let lastAwardAt = 0

  const leaveCurrentRoom = () => {
    if (!joinedRoom) return
    const room = joinedRoom
    const me = room.participants.get(socket.id)
    joinedRoom = null
    socket.leave(room.id)

    if (me) {
      room.participants.delete(socket.id)
      const m = sysMsg(room, `${me.name} left the stage`)
      io.to(room.id).emit('chat', { message: m })
      io.to(room.id).emit('participant-left', { id: socket.id, name: me.name })

      // if the singer leaves, the Main Seat opens up again
      if (room.stage && room.stage.singerId === socket.id) {
        room.stage = null
        const s = sysMsg(room, `🎤 ${me.name} stepped down — the Main Seat is free`)
        io.to(room.id).emit('chat', { message: s })
      }

      // reassign host
      if (room.hostId === socket.id) {
        const next = Array.from(room.participants.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0]
        room.hostId = next?.id ?? ''
        if (next) next.isHost = true
        if (next) sysMsg(room, `${next.name} is now the host`)
      }
    }

    if (room.participants.size === 0) {
      if (!room.isDefault) rooms.delete(room.id)
      else room.stage = null
    } else {
      broadcastRoom(room)
    }
  }

  /* ------------------------------- rooms -------------------------------- */

  socket.on('list-rooms', (data: { state: string }, ack?: (rooms: unknown[]) => void) => {
    const state = (data?.state ?? '').trim()
    if (!state) return
    const list = roomListForState(state)
    if (typeof ack === 'function') ack(list)
    else socket.emit('room-list', { state, rooms: list })
  })

  socket.on(
    'join-room',
    (data: JoinPayload, ack?: (res: { ok: boolean; error?: string; room?: unknown }) => void) => {
      try {
        const state = (data?.state ?? '').trim()
        const name = (data?.profile?.name ?? '').trim().slice(0, 24) || 'Anonymous'
        const color = /^#[0-9A-Fa-f]{6}$/.test(data?.profile?.color ?? '')
          ? data.profile.color
          : AVATAR_COLORS[0]
        const pid = (data?.pid ?? '').trim().slice(0, 64) || `pid:${socket.id}`

        if (!state) return ack?.({ ok: false, error: 'State is required' })

        let room: Room | undefined
        if (data.roomId && data.roomId.startsWith('state:')) {
          room = ensureDefaultRoom(state)
        } else if (data.roomId) {
          const found = rooms.get(data.roomId)
          if (!found) return ack?.({ ok: false, error: 'Room not found — it may have closed' })
          room = found
        } else {
          room = ensureDefaultRoom(state)
        }

        const alreadyHere = room.participants.has(socket.id)
        if (!alreadyHere && room.participants.size >= MAX_PARTICIPANTS) {
          return ack?.({ ok: false, error: `Room is full (max ${MAX_PARTICIPANTS} singers)` })
        }

        leaveCurrentRoom()

        // if default room is in another state than requested, fix it
        if (room.isDefault && room.state.toLowerCase() !== state.toLowerCase()) {
          room = ensureDefaultRoom(state)
        }

        // Same person rejoining (page refresh / flaky network): drop the stale
        // socket entry so their name stays theirs and the seat follows them.
        const stale = Array.from(room.participants.values()).find((p) => p.pid === pid && p.id !== socket.id)
        if (stale) {
          room.participants.delete(stale.id)
          if (room.stage && room.stage.singerId === stale.id) {
            room.stage.singerId = socket.id
          }
          if (room.hostId === stale.id) room.hostId = socket.id
          io.to(room.id).emit('participant-left', { id: stale.id, name: stale.name })
        }

        // Unique names inside a room — nobody can ride someone else's identity.
        const lower = name.toLowerCase()
        const nameTaken = Array.from(room.participants.values()).some(
          (p) => p.name.toLowerCase() === lower && p.pid !== pid,
        )
        if (nameTaken) {
          return ack?.({
            ok: false,
            error: `The name "${name}" is already taken in this room — pick another one.`,
          })
        }

        const existing = room.participants.get(socket.id)
        if (existing) {
          existing.pid = pid
          existing.name = name
          existing.color = color
          existing.micOn = !!data.micOn
          existing.camOn = !!data.camOn
          if (room.stage && room.stage.singerId === socket.id) room.stage.singerName = name
        } else {
          room.participants.set(socket.id, {
            id: socket.id,
            pid,
            name,
            color,
            micOn: !!data.micOn,
            camOn: !!data.camOn,
            isHost: false,
            joinedAt: Date.now(),
          })
          if (!room.hostId) {
            room.hostId = socket.id
            room.participants.get(socket.id)!.isHost = true
          }
          const m = sysMsg(room, `${name} joined the stage 🎤`)
          room.chat.push(m)
          io.to(room.id).emit('participant-joined', {
            participant: room.participants.get(socket.id),
            message: m,
          })
        }

        joinedRoom = room
        socket.join(room.id)

        ack?.({ ok: true, room: roomSnapshot(room) })
        broadcastRoom(room)
        if (room.karaoke) broadcastKaraoke(room)
        console.log(`${name} joined room ${room.name} [${room.state}] (${room.participants.size} online)`)
      } catch (e) {
        console.error('join-room error', e)
        ack?.({ ok: false, error: 'Failed to join room' })
      }
    },
  )

  socket.on('create-room', (data: { name: string; state: string }, ack?: (res: { ok: boolean; error?: string; roomId?: string }) => void) => {
    const state = (data?.state ?? '').trim()
    const name = (data?.name ?? '').trim().slice(0, 40)
    if (!state) return ack?.({ ok: false, error: 'State is required' })
    if (!name) return ack?.({ ok: false, error: 'Room name is required' })

    const full = Array.from(rooms.values()).filter((r) => r.state.toLowerCase() === state.toLowerCase()).length >= 50
    if (full) return ack?.({ ok: false, error: 'Too many open rooms in this state' })

    const room: Room = {
      id: randomCode(),
      name,
      state,
      hostId: '',
      createdAt: Date.now(),
      isDefault: false,
      participants: new Map(),
      ...defaultRoomObjects(),
    }
    rooms.set(room.id, room)
    ack?.({ ok: true, roomId: room.id })
  })

  socket.on('leave-room', () => {
    const room = joinedRoom
    const name = room?.participants.get(socket.id)?.name
    leaveCurrentRoom()
    socket.emit('left-room')
    if (room && name) broadcastRoom(room)
  })

  /* ---------------------------- media state ------------------------------ */

  socket.on('media-state', (data: { micOn: boolean; camOn: boolean }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return
    me.micOn = !!data.micOn
    me.camOn = !!data.camOn
    broadcastRoom(room)
  })

  /* ---------------------------- chat ------------------------------------- */

  socket.on('chat', (data: { text: string }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    const text = (data?.text ?? '').trim().slice(0, 300)
    if (!room || !me || !text) return
    const m: ChatMessage = {
      id: msgId(),
      type: 'user',
      from: socket.id,
      name: me.name,
      color: me.color,
      text,
      at: Date.now(),
    }
    room.chat.push(m)
    if (room.chat.length > CHAT_HISTORY * 2) room.chat = room.chat.slice(-CHAT_HISTORY)
    io.to(room.id).emit('chat', { message: m })
  })

  /* ------------------------- webRTC signaling ---------------------------- */

  socket.on('webrtc-offer', (data: { to: string; sdp: string }) => {
    if (!data?.to || !data?.sdp) return
    io.to(data.to).emit('webrtc-offer', { from: socket.id, sdp: data.sdp })
  })

  socket.on('webrtc-answer', (data: { to: string; sdp: string }) => {
    if (!data?.to || !data?.sdp) return
    io.to(data.to).emit('webrtc-answer', { from: socket.id, sdp: data.sdp })
  })

  socket.on('webrtc-ice', (data: { to: string; candidate: RTCIceCandidateInit }) => {
    if (!data?.to || !data?.candidate) return
    io.to(data.to).emit('webrtc-ice', { from: socket.id, candidate: data.candidate })
  })

  /* --------------------------- the Main Seat ------------------------------ */

  socket.on('stage-take', (ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })

    if (room.stage) {
      if (room.stage.singerId === socket.id) return ack?.({ ok: true })
      return ack?.({ ok: false, error: `${room.stage.singerName} is on the Main Seat — wait for them to step down.` })
    }

    room.stage = {
      singerId: socket.id,
      singerName: me.name,
      singerColor: me.color,
      since: Date.now(),
      points: 0,
      poppers: 0,
      hearts: 0,
    }
    queueScore(me.name, room.state, { performances: 1 })

    const m = sysMsg(room, `🎤 ${me.name} took the Main Seat — cheer with poppers & hearts!`)
    io.to(room.id).emit('chat', { message: m })
    broadcastRoom(room)
    ack?.({ ok: true })
  })

  socket.on('stage-leave', (ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    if (!room?.stage || room.stage.singerId !== socket.id) return ack?.({ ok: false })
    const name = room.stage.singerName
    const pts = room.stage.points
    room.stage = null
    const m = sysMsg(room, `👏 ${name} stepped down from the Main Seat (${pts} pts this session)`)
    io.to(room.id).emit('chat', { message: m })
    broadcastRoom(room)
    ack?.({ ok: true })
  })

  socket.on('stage-award', (data: { kind: 'popper' | 'heart' }, ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
    const stage = room.stage
    if (!stage) return ack?.({ ok: false, error: 'Nobody is in the Main Seat right now' })
    if (stage.singerId === socket.id)
      return ack?.({ ok: false, error: 'You cannot applaud your own performance 😄' })

    const now = Date.now()
    if (now - lastAwardAt < AWARD_COOLDOWN_MS)
      return ack?.({ ok: false, error: 'Easy! Give the singer a moment 😊' })
    lastAwardAt = now

    const kind = data?.kind === 'heart' ? 'heart' : 'popper'
    const points = kind === 'heart' ? HEART_POINTS : POPPER_POINTS
    stage.points += points
    if (kind === 'heart') stage.hearts += 1
    else stage.poppers += 1

    queueScore(stage.singerName, room.state, {
      points,
      poppers: kind === 'popper' ? 1 : 0,
      hearts: kind === 'heart' ? 1 : 0,
    })

    const applause: ApplauseEvent = {
      id: msgId(),
      kind,
      points,
      by: socket.id,
      byName: me.name,
      singerId: stage.singerId,
      singerName: stage.singerName,
      stage: { points: stage.points, poppers: stage.poppers, hearts: stage.hearts },
      at: now,
    }
    io.to(room.id).emit('stage-applause', applause)
    broadcastRoom(room)
    ack?.({ ok: true })
  })

  /* ------------------------------ karaoke -------------------------------- */

  socket.on('karaoke-load', (data: { videoId: string; title?: string }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return
    const videoId = (data?.videoId ?? '').trim()
    if (!validVideoId(videoId)) return
    room.karaoke = {
      videoId,
      title: (data?.title ?? '').slice(0, 160),
      playing: true,
      positionAt: 0,
      updatedAt: Date.now(),
      by: socket.id,
      byName: me.name,
      queue: (room.karaoke?.queue ?? []).filter((q) => q.videoId !== videoId),
    }
    const m = sysMsg(room, `🎵 ${me.name} queued a karaoke track — sing along!`)
    io.to(room.id).emit('chat', { message: m })
    broadcastKaraoke(room)
  })

  socket.on('karaoke-play', (data: { position?: number }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me || !room.karaoke) return
    const k = room.karaoke
    k.playing = true
    k.positionAt = Math.max(0, Number(data?.position) || 0)
    k.updatedAt = Date.now()
    k.by = socket.id
    k.byName = me.name
    broadcastKaraoke(room)
  })

  socket.on('karaoke-pause', (data: { position?: number }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me || !room.karaoke) return
    const k = room.karaoke
    k.playing = false
    k.positionAt = Math.max(0, Number(data?.position) || 0)
    k.updatedAt = Date.now()
    k.by = socket.id
    k.byName = me.name
    broadcastKaraoke(room)
  })

  socket.on('karaoke-seek', (data: { position?: number }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me || !room.karaoke) return
    const k = room.karaoke
    k.positionAt = Math.max(0, Number(data?.position) || 0)
    k.updatedAt = Date.now()
    k.by = socket.id
    k.byName = me.name
    broadcastKaraoke(room)
  })

  socket.on('karaoke-ended', () => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !room.karaoke) return
    // de-dupe simultaneous ENDED events from several clients
    if (Date.now() - room.karaokeEndedAt < 2000) return
    room.karaokeEndedAt = Date.now()
    const k = room.karaoke
    const next = k.queue.shift()
    if (next) {
      k.videoId = next.videoId
      k.title = next.title
      k.playing = true
      k.positionAt = 0
      k.updatedAt = Date.now()
      k.by = next.by
      k.byName = next.byName || me?.name || 'Anonymous'
      const m = sysMsg(room, `⏭️ Now playing from the queue: ${k.title || 'a track'}`)
      io.to(room.id).emit('chat', { message: m })
    } else {
      k.playing = false
      k.updatedAt = Date.now()
      k.by = socket.id
    }
    broadcastKaraoke(room)
  })

  socket.on('karaoke-queue-add', (data: { videoId: string; title?: string }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return
    const videoId = (data?.videoId ?? '').trim()
    if (!validVideoId(videoId)) return
    const k = room.karaoke ?? {
      videoId: '', title: '', playing: false, positionAt: 0,
      updatedAt: 0, by: '', byName: '', queue: [],
    }
    if (k.queue.length >= MAX_KARAOKE_QUEUE) return
    if (k.queue.some((q) => q.videoId === videoId) || k.videoId === videoId) return
    k.queue.push({
      videoId,
      title: (data?.title ?? '').slice(0, 160),
      by: socket.id,
      byName: me.name,
    })
    room.karaoke = k
    broadcastKaraoke(room)
  })

  socket.on('karaoke-queue-remove', (data: { index: number }) => {
    const room = joinedRoom
    if (!room?.karaoke) return
    const idx = Math.round(Number(data?.index))
    if (!Number.isInteger(idx) || idx < 0 || idx >= room.karaoke.queue.length) return
    room.karaoke.queue.splice(idx, 1)
    broadcastKaraoke(room)
  })

  /* ------------------------------ cleanup -------------------------------- */

  socket.on('disconnect', () => {
    console.log(`socket disconnected: ${socket.id}`)
    leaveCurrentRoom()
  })

  socket.on('error', (e) => console.error(`socket error (${socket.id}):`, e))
})

httpServer.listen(PORT, () => {
  console.log(`✅ SingAlong realtime service running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
