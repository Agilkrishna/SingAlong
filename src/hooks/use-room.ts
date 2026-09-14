'use client'

/**
 * use-room — Socket.io room state + WebRTC mesh media hook.
 *
 * Media model: every participant publishes one audio + one video track and
 * toggles `track.enabled` for mute/camera-off (no renegotiation needed).
 * Mesh negotiation uses the "perfect negotiation" pattern so simultaneous
 * joins can't glare (polite peer = lexicographically smaller socket id).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'

export interface Participant {
  id: string
  /** server-side only (rejoin matching) — not included in room snapshots */
  pid?: string
  name: string
  color: string
  /** optional emoji avatar picked at join */
  avatar?: string
  micOn: boolean
  camOn: boolean
  isHost: boolean
  joinedAt: number
  /** host-enforced mute (server keeps rejecting their mic-on) */
  forcedMuted?: boolean
  /** socket dropped — the service holds their seat for a grace window */
  disconnected?: boolean
}

export interface ChatMessage {
  id: string
  type: 'user' | 'system'
  from?: string
  name?: string
  color?: string
  avatar?: string
  text: string
  at: number
}

export interface StageState {
  singerId: string
  singerName: string
  singerColor: string
  since: number
  points: number
  poppers: number
  hearts: number
}

export type ApplauseKind = 'popper' | 'heart'

export interface ApplauseEvent {
  id: string
  kind: ApplauseKind
  points: number
  by: string
  byName: string
  singerId: string
  singerName: string
  stage: { points: number; poppers: number; hearts: number }
  at: number
}

export interface QueueItem {
  videoId: string
  title: string
  by: string
  byName: string
}

export interface KaraokeState {
  videoId: string
  title: string
  playing: boolean
  positionAt: number
  updatedAt: number
  by: string
  byName: string
  queue: QueueItem[]
  serverNow?: number
}

export type ActivityKind = 'sing' | 'listen' | 'watch'

/** live trivia quiz — sanitized server view (answer hidden mid-question) */
export interface QuizPublic {
  phase: 'question' | 'reveal'
  index: number
  total: number
  q: string
  options: string[]
  endsAt: number
  answersCount: number
  scores: Record<string, number>
  byName: string
  correct?: number
  gotIt?: string[]
}

/** Truth-or-Dare / Rapid-fire prompt card */
export interface PromptsPublic {
  mode: 'truth' | 'dare' | 'rapid'
  text: string
  target: string
  byName: string
  at: number
}

/** classic Antakshari letter game (Sing Along activity) */
export interface AntakshariPublic {
  players: string[]
  turnIdx: number
  letter: string
  scores: Record<string, number>
  endsAt: number
  byName: string
}

/** floating-heart reaction (pure fun — no points, every activity) */
export interface ReactionEvent {
  id: string
  kind: 'heart'
  by: string
  byName: string
  at: number
}

export interface RoomSnapshot {
  id: string
  name: string
  state: string
  hostId: string
  /** what this room IS — 'hangout' (chat-first, default) or 'sing'
   *  (dedicated singing room). Optional so stale snapshots stay harmless. */
  kind?: 'hangout' | 'sing'
  /** 'chat' = plain hangout (default) · 'sing' = Sing Along activity ·
   *  'listen' = Listen Together · 'watch' = Watch Party.
   *  Optional so stale snapshots (old service mid-deploy) stay harmless. */
  activity?: 'chat' | 'sing' | 'listen' | 'watch'
  /** vibe tags chosen at creation ('chai-time', 'retro', …) */
  tags?: string[]
  /** today's icebreaker prompt — deterministic per room + day */
  prompt?: string
  /** live party games (optional → stale snapshots harmless) */
  quiz?: QuizPublic | null
  prompts?: PromptsPublic | null
  antakshari?: AntakshariPublic | null
  /** epoch ms — "Starting soon" scheduled rooms */
  scheduleAt?: number
  participants: Participant[]
  stage: StageState | null
  chat: ChatMessage[]
  karaoke: KaraokeState | null
}

export interface LobbyRoom {
  id: string
  name: string
  state: string
  count: number
  live: boolean
  isDefault: boolean
  /** 'hangout' (default when absent) · 'sing' = dedicated singing room */
  kind?: 'hangout' | 'sing'
  /** vibe tags ('chai-time', 'retro', …) */
  tags?: string[]
  /** passcode-locked private room */
  locked?: boolean
  /** epoch ms — "Starting soon" scheduled rooms */
  scheduleAt?: number
}

export interface JoinOptions {
  roomId: string
  state: string
  profile: { name: string; color: string; avatar?: string }
  pid: string
  micOn: boolean
  camOn: boolean
  /** required when the room is passcode-locked */
  passcode?: string
}

export type MediaError = { kind: 'denied' | 'unavailable' | 'none'; message: string }

/** what leaveRoom hands back for the session recap card */
export interface SessionRecap {
  roomName: string
  durationMs: number
  messages: number
  hearts: number
  awards: number
  songs: number
}

const CHAT_HISTORY = 60

/**
 * Chat ids are React list keys — never let a snapshot put the same id twice.
 * Keeps the first occurrence, drops malformed entries, caps history.
 */
function dedupeChat(chat: ChatMessage[] | undefined): ChatMessage[] {
  const seen = new Set<string>()
  const out: ChatMessage[] = []
  for (const m of chat ?? []) {
    if (!m?.id || seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
  }
  return out.slice(-CHAT_HISTORY)
}

// STUN is enough for most networks. For strict/symmetric NATs (some mobile
// carriers) set NEXT_PUBLIC_TURN_URL / NEXT_PUBLIC_TURN_USERNAME /
// NEXT_PUBLIC_TURN_CREDENTIAL at BUILD time to add a TURN relay.
const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ...(process.env.NEXT_PUBLIC_TURN_URL
      ? [
          {
            urls: process.env.NEXT_PUBLIC_TURN_URL,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME,
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
          },
        ]
      : []),
  ],
}

export function useRoom() {
  const socketRef = useRef<Socket | null>(null)
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const makingOfferRef = useRef<Map<string, boolean>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())

  const [connected, setConnected] = useState(false)
  const [myId, setMyId] = useState<string>('')
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [lobbyRooms, setLobbyRooms] = useState<LobbyRoom[]>([])
  const [inRoom, setInRoom] = useState(false)
  const [joinError, setJoinError] = useState<string>('')
  const joinErrorRef = useRef<string>('')
  const [mediaError, setMediaError] = useState<MediaError | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({})
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [hasVideoTrack, setHasVideoTrack] = useState(false)
  const [applause, setApplause] = useState<ApplauseEvent[]>([])
  const [reactions, setReactions] = useState<ReactionEvent[]>([])
  const [removed, setRemoved] = useState<string>('')
  /** socket round-trip in ms (null until the first probe lands) */
  const [latency, setLatency] = useState<number | null>(null)
  /** "Back online — you're still in the room" — one-shot after auto-rejoin */
  const [rejoined, setRejoined] = useState<string>('')

  // auto-rejoin machinery: the last join payload lets a reconnecting socket
  // silently resume the same seat (the service matches on pid)
  const lastJoinRef = useRef<JoinOptions | null>(null)
  const inRoomRef = useRef(false)
  const everConnectedRef = useRef(false)
  // session recap counters (this device, this visit)
  const sessionRef = useRef({ startedAt: 0, roomName: '', messages: 0, hearts: 0, awards: 0, songs: 0 })

  /* ------------------------- local media bootstrap ------------------------ */

  const acquireLocalMedia = useCallback(async (wantCam: boolean): Promise<boolean> => {
    if (localStreamRef.current) return true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: wantCam
          ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
          : false,
      })
      localStreamRef.current = stream
      setLocalStream(stream)
      setHasVideoTrack(stream.getVideoTracks().length > 0)
      setMicOn(true)
      setCamOn(wantCam && stream.getVideoTracks().length > 0)
      setMediaError(null)
      return true
    } catch (e: unknown) {
      const err = e as DOMException
      // try audio-only fallback
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        localStreamRef.current = stream
        setLocalStream(stream)
        setHasVideoTrack(false)
        setMicOn(true)
        setCamOn(false)
        setMediaError({
          kind: 'denied',
          message: 'Camera unavailable — joined with audio only.',
        })
        return true
      } catch {
        setMediaError({
          kind: err?.name === 'NotAllowedError' ? 'denied' : 'unavailable',
          message:
            'Mic & camera blocked. You can still join, chat and watch the performance.',
        })
        setMicOn(false)
        setCamOn(false)
        return false
      }
    }
  }, [])

  /* --------------------------- peer connections --------------------------- */

  const getOrCreatePc = useCallback((peerId: string): RTCPeerConnection => {
    const existing = pcsRef.current.get(peerId)
    if (existing) return existing

    const pc = new RTCPeerConnection(ICE_CONFIG)
    pcsRef.current.set(peerId, pc)

    // publish local tracks
    const local = localStreamRef.current
    if (local) {
      local.getTracks().forEach((track) => pc.addTrack(track, local))
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' })
      pc.addTransceiver('video', { direction: 'recvonly' })
    }

    const inbound = new MediaStream()
    pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach((t) => {
        if (!inbound.getTracks().find((x) => x.id === t.id)) inbound.addTrack(t)
      })
      setRemoteStreams((prev) => {
        if (prev[peerId] === inbound) return prev
        return { ...prev, [peerId]: inbound }
      })
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate && socketRef.current) {
        socketRef.current.emit('webrtc-ice', {
          to: peerId,
          candidate: ev.candidate.toJSON(),
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        pc.restartIce()
      }
    }

    return pc
  }, [])

  const closePeer = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId)
    if (pc) {
      pc.ontrack = () => {}
      pc.onicecandidate = () => {}
      pc.close()
      pcsRef.current.delete(peerId)
    }
    makingOfferRef.current.delete(peerId)
    pendingIceRef.current.delete(peerId)
    setRemoteStreams((prev) => {
      const next = { ...prev }
      delete next[peerId]
      return next
    })
  }, [])

  const startOffer = useCallback(
    async (peerId: string) => {
      const socket = socketRef.current
      if (!socket || socket.id === peerId) return
      try {
        const pc = getOrCreatePc(peerId)
        makingOfferRef.current.set(peerId, true)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('webrtc-offer', { to: peerId, sdp: pc.localDescription!.sdp })
      } catch (e) {
        console.error('offer failed', peerId, e)
      } finally {
        makingOfferRef.current.delete(peerId)
      }
    },
    [getOrCreatePc],
  )

  /* ------------------------------ socket setup ---------------------------- */

  useEffect(() => {
    // Only connect the socket once the page is interactive (client side)
    const socket = (async () => {
      const { io } = await import('socket.io-client')
      return io('/?XTransformPort=3003', {
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 10000,
      })
    })()

    let disposed = false

    ;(async () => {
      const s = await socket
      if (disposed) {
        s.disconnect()
        return
      }
      socketRef.current = s

      s.on('connect', () => {
        setConnected(true)
        setMyId(s.id ?? '')
        // network blip recovered mid-room → silently resume the same seat.
        // The service matches on pid, so the name/seat/host status follow us.
        if (everConnectedRef.current && inRoomRef.current && lastJoinRef.current) {
          s.emit('join-room', lastJoinRef.current, (res: { ok: boolean; error?: string }) => {
            if (res?.ok) {
              setRejoined('Back online — you are still in the room! 🔁')
            } else {
              inRoomRef.current = false
              setInRoom(false)
            }
          })
        }
        everConnectedRef.current = true
      })
      s.on('disconnect', () => setConnected(false))

      s.on('room-state', (data: { room: RoomSnapshot }) => {
        // dedupe guards against any legacy/mid-deploy server still double-writing chat
        setRoom(data.room ? { ...data.room, chat: dedupeChat(data.room.chat) } : data.room)
        // remember the room name for the session recap card
        if (data.room && sessionRef.current.startedAt) sessionRef.current.roomName = data.room.name
        // mesh: initiate offers to peers who joined after me
        const myJoin = data.room.participants.find((p) => p.id === s.id)?.joinedAt ?? Infinity
        data.room.participants.forEach((p) => {
          if (p.id === s.id) return
          if (!pcsRef.current.has(p.id) && p.joinedAt > myJoin) {
            startOffer(p.id)
          }
        })
      })

      // incremental chat messages (user messages + system notices that are
      // emitted without a full room broadcast). Dedup by id guards against
      // double delivery when a `room-state` snapshot follows.
      s.on('chat', (data: { message: ChatMessage }) => {
        const m = data?.message
        if (!m || !m.id) return
        setRoom((r) =>
          r && !r.chat.some((c) => c.id === m.id)
            ? { ...r, chat: [...r.chat, m].slice(-CHAT_HISTORY) }
            : r,
        )
      })

      s.on('participant-joined', (data: { participant: Participant }) => {
        // newcomer offers; we just wait for their offer
        void data
      })

      s.on('participant-left', (data: { id: string }) => {
        closePeer(data.id)
      })

      s.on('webrtc-offer', async (data: { from: string; sdp: string }) => {
        try {
          const pc = getOrCreatePc(data.from)
          const offerCollision =
            makingOfferRef.current.get(data.from) || pc.signalingState !== 'stable'
          const polite = (s.id ?? '') < data.from
          if (offerCollision && !polite) return // ignore offer; our offer will win
          if (offerCollision && polite) {
            await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit)
          }
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
          // flush queued ICE
          const pending = pendingIceRef.current.get(data.from) ?? []
          for (const c of pending) {
            try {
              await pc.addIceCandidate(c)
            } catch {}
          }
          pendingIceRef.current.delete(data.from)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          s.emit('webrtc-answer', { to: data.from, sdp: pc.localDescription!.sdp })
        } catch (e) {
          console.error('answer failed', e)
        }
      })

      s.on('webrtc-answer', async (data: { from: string; sdp: string }) => {
        try {
          const pc = pcsRef.current.get(data.from)
          if (!pc) return
          await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
          const pending = pendingIceRef.current.get(data.from) ?? []
          for (const c of pending) {
            try {
              await pc.addIceCandidate(c)
            } catch {}
          }
          pendingIceRef.current.delete(data.from)
        } catch (e) {
          console.error('remote answer failed', e)
        }
      })

      s.on('webrtc-ice', async (data: { from: string; candidate: RTCIceCandidateInit }) => {
        try {
          const pc = pcsRef.current.get(data.from)
          if (!pc || !pc.remoteDescription) {
            const list = pendingIceRef.current.get(data.from) ?? []
            list.push(data.candidate)
            pendingIceRef.current.set(data.from, list)
            return
          }
          await pc.addIceCandidate(data.candidate)
        } catch (e) {
          console.warn('ice failed', e)
        }
      })

      s.on('stage-applause', (data: ApplauseEvent) => {
        if (!data?.id) return
        setApplause((prev) => [...prev.slice(-7), data])
      })

      s.on('karaoke-state', (data: { karaoke: KaraokeState }) => {
        if (!data?.karaoke) return
        setRoom((prev) => (prev ? { ...prev, karaoke: data.karaoke } : prev))
      })

      // host-enforced mute — self-mute immediately so it is audible too
      s.on('force-mute', (data: { muted: boolean }) => {
        if (data?.muted) {
          localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false))
          setMicOn(false)
        }
      })

      // the host dropped us — page.tsx shows the message and returns to lobby
      s.on('removed-from-room', (data: { message?: string }) => {
        setRemoved(data?.message || 'The host removed you from the room.')
      })

      // floating hearts from anyone in the room
      s.on('room-reaction', (data: ReactionEvent) => {
        if (!data?.id) return
        setReactions((prev) => [...prev.slice(-14), data])
      })
    })()

    // network-quality probe — one ack round-trip every 6s while connected
    const latencyTimer = setInterval(() => {
      const sock = socketRef.current
      if (!sock?.connected) return
      const t0 = Date.now()
      sock.emit('latency-ping', () => {
        setLatency(Date.now() - t0)
      })
    }, 6000)

    return () => {
      disposed = true
      clearInterval(latencyTimer)
      Promise.resolve(socket).then((s) => s.disconnect())
      pcsRef.current.forEach((pc) => pc.close())
      pcsRef.current.clear()
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
  }, [closePeer, getOrCreatePc, startOffer])

  /* ------------------------------- actions -------------------------------- */

  const listRooms = useCallback((state: string) => {
    socketRef.current?.emit('list-rooms', { state }, (rooms: LobbyRoom[]) => {
      if (Array.isArray(rooms)) setLobbyRooms(rooms)
    })
  }, [])

  const createRoom = useCallback(
    (
      name: string,
      state: string,
      kind: 'hangout' | 'sing' = 'hangout',
      tags: string[] = [],
      passcode?: string,
      scheduleAt?: number,
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        socketRef.current?.emit(
          'create-room',
          { name, state, kind, tags, passcode, scheduleAt },
          (res: { ok: boolean; roomId?: string; error?: string }) => {
            resolve(res?.ok ? res.roomId ?? null : null)
          },
        )
      })
    },
    [],
  )

  const joinRoom = useCallback(
    async (opts: JoinOptions) => {
      setJoinError('')
      joinErrorRef.current = ''
      // listener mode (no mic, no cam) skips the permission prompt entirely —
      // the browser never asks for camera/microphone on join
      const wantMedia = opts.micOn || opts.camOn
      const gotMedia = wantMedia ? await acquireLocalMedia(opts.camOn) : false
      if (!wantMedia) {
        setMicOn(false)
        setCamOn(false)
        setMediaError(null)
      }
      const socket = socketRef.current
      if (!socket) {
        setJoinError('Still connecting… try again in a second.')
        return false
      }
      return new Promise<boolean>((resolve) => {
        const payload = {
          roomId: opts.roomId,
          state: opts.state,
          profile: opts.profile,
          pid: opts.pid,
          micOn: gotMedia && opts.micOn,
          camOn: gotMedia && opts.camOn && (localStreamRef.current?.getVideoTracks().length ?? 0) > 0,
          passcode: opts.passcode,
        }
        // remembered so a mid-room reconnect can silently resume this seat
        lastJoinRef.current = payload
        socket.emit('join-room', payload, (res: { ok: boolean; error?: string }) => {
          if (res?.ok) {
            inRoomRef.current = true
            setInRoom(true)
            // fresh session for the recap card
            sessionRef.current = {
              startedAt: Date.now(),
              roomName: '',
              messages: 0,
              hearts: 0,
              awards: 0,
              songs: 0,
            }
            resolve(true)
          } else {
            joinErrorRef.current = res?.error ?? 'Could not join room'
            setJoinError(res?.error ?? 'Could not join room')
            resolve(false)
          }
        })
      })
    },
    [acquireLocalMedia],
  )

  const leaveRoom = useCallback((): SessionRecap | null => {
    socketRef.current?.emit('leave-room')
    inRoomRef.current = false
    lastJoinRef.current = null
    setInRoom(false)
    setRoom(null)
    setRemoteStreams({})
    pcsRef.current.forEach((pc) => pc.close())
    pcsRef.current.clear()
    pendingIceRef.current.clear()
    // hand back the session stats for the recap card, then reset
    const s = sessionRef.current
    const recap: SessionRecap | null = s.startedAt
      ? {
          roomName: s.roomName || 'the hangout',
          durationMs: Date.now() - s.startedAt,
          messages: s.messages,
          hearts: s.hearts,
          awards: s.awards,
          songs: s.songs,
        }
      : null
    sessionRef.current = { startedAt: 0, roomName: '', messages: 0, hearts: 0, awards: 0, songs: 0 }
    return recap
  }, [])

  /* ---------------------- listener → singer upgrade ----------------------- */

  // A listener joined without media; when they later tap mic/cam we acquire
  // the stream, attach it to every existing peer connection and re-offer.
  const publishStreamToPeers = useCallback(
    (stream: MediaStream) => {
      pcsRef.current.forEach((pc) => {
        stream.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, stream)
          } catch {}
        })
      })
      // renegotiate with every peer so they start receiving our tracks
      pcsRef.current.forEach((_pc, peerId) => {
        void startOffer(peerId)
      })
    },
    [startOffer],
  )

  const toggleMic = useCallback(
    async (onError?: (msg: string) => void) => {
      let stream = localStreamRef.current
      if (!stream) {
        // listener upgrading to singer — ask for mic (camera included so the
        // full upgrade happens in one permission prompt)
        const got = await acquireLocalMedia(true)
        stream = localStreamRef.current
        if (!got || !stream) {
          onError?.('Mic & camera are blocked — check your browser permissions.')
          return false
        }
        publishStreamToPeers(stream)
      }
      const next = !micOn
      stream.getAudioTracks().forEach((t) => (t.enabled = next))
      setMicOn(next)
      socketRef.current?.emit('media-state', { micOn: next, camOn })
      return next
    },
    [micOn, camOn, acquireLocalMedia, publishStreamToPeers],
  )

  const toggleCam = useCallback(
    async (onError?: (msg: string) => void) => {
      let stream = localStreamRef.current
      if (!stream) {
        const got = await acquireLocalMedia(true)
        stream = localStreamRef.current
        if (!got || !stream) {
          onError?.('Mic & camera are blocked — check your browser permissions.')
          return false
        }
        publishStreamToPeers(stream)
      }
      if (stream.getVideoTracks().length === 0) return false
      const next = !camOn
      stream.getVideoTracks().forEach((t) => (t.enabled = next))
      setCamOn(next)
      socketRef.current?.emit('media-state', { micOn, camOn: next })
      return next
    },
    [micOn, camOn, acquireLocalMedia, publishStreamToPeers],
  )

  const sendChat = useCallback((text: string) => {
    if (text.trim()) {
      socketRef.current?.emit('chat', { text: text.trim() })
      sessionRef.current.messages += 1
    }
  }, [])

  /* ----------------- room activities: sing · listen · watch ---------------- */

  // Anyone can start a shared activity — the whole room flips layouts together
  // until someone ends it and everyone drops back into chat.
  const startActivity = useCallback(
    (kind: ActivityKind, onError?: (msg: string) => void) => {
      socketRef.current?.emit('activity-start', { kind }, (res: { ok: boolean; error?: string }) => {
        if (res && !res.ok && res.error) onError?.(res.error)
      })
    },
    [],
  )

  const endActivity = useCallback(() => {
    socketRef.current?.emit('activity-end')
  }, [])

  /** @deprecated alias kept for readability — use startActivity('sing') */
  const startSingAlong = useCallback(
    (onError?: (msg: string) => void) => startActivity('sing', onError),
    [startActivity],
  )
  const endSingAlong = endActivity

  /* ---------------------------- the Main Seat ------------------------------ */

  const takeSeat = useCallback(
    async (handlers?: { onError?: (msg: string) => void; onSuccess?: () => void }) => {
      // The Main Seat is the singing seat. A listener (or anyone without media
      // yet) gets ONE combined mic+camera prompt right on this tap — sitting
      // down silently would look broken, so a hard block beats a muted seat.
      if (!localStreamRef.current) {
        const got = await acquireLocalMedia(true)
        const stream = localStreamRef.current
        if (!got || !stream) {
          handlers?.onError?.(
            'Mic & camera are needed to sing from the Main Seat — allow them in your browser and try again.',
          )
          return
        }
        publishStreamToPeers(stream)
      }
      socketRef.current?.emit('stage-take', (res: { ok: boolean; error?: string }) => {
        if (res && !res.ok && res.error) handlers?.onError?.(res.error)
        else if (res?.ok) handlers?.onSuccess?.()
      })
    },
    [acquireLocalMedia, publishStreamToPeers],
  )

  const leaveSeat = useCallback(() => {
    socketRef.current?.emit('stage-leave')
  }, [])

  const award = useCallback((kind: ApplauseKind, onError?: (msg: string) => void) => {
    socketRef.current?.emit('stage-award', { kind }, (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok && res.error) onError?.(res.error)
      else if (res?.ok) sessionRef.current.awards += 1
    })
  }, [])

  const clearApplause = useCallback((id: string) => {
    setApplause((prev) => prev.filter((a) => a.id !== id))
  }, [])

  /* ------------------------------- karaoke -------------------------------- */

  const karaokeLoad = useCallback((videoId: string, title: string) => {
    socketRef.current?.emit('karaoke-load', { videoId, title })
    sessionRef.current.songs += 1
  }, [])

  const karaokePlay = useCallback((position: number) => {
    socketRef.current?.emit('karaoke-play', { position })
  }, [])

  const karaokePause = useCallback((position: number) => {
    socketRef.current?.emit('karaoke-pause', { position })
  }, [])

  const karaokeSeek = useCallback((position: number) => {
    socketRef.current?.emit('karaoke-seek', { position })
  }, [])

  const karaokeEnded = useCallback(() => {
    socketRef.current?.emit('karaoke-ended')
  }, [])

  const karaokeQueueAdd = useCallback((videoId: string, title: string) => {
    socketRef.current?.emit('karaoke-queue-add', { videoId, title })
    sessionRef.current.songs += 1
  }, [])

  const karaokeQueueRemove = useCallback((index: number) => {
    socketRef.current?.emit('karaoke-queue-remove', { index })
  }, [])

  /* --------------------------- people & safety ----------------------------- */

  const hostMute = useCallback(
    (targetId: string, muted: boolean, onError?: (msg: string) => void) => {
      socketRef.current?.emit(
        'host-mute',
        { targetId, muted },
        (res: { ok: boolean; error?: string }) => {
          if (res && !res.ok && res.error) onError?.(res.error)
        },
      )
    },
    [],
  )

  const hostRemove = useCallback(
    (targetId: string, onError?: (msg: string) => void) => {
      socketRef.current?.emit('host-remove', { targetId }, (res: { ok: boolean; error?: string }) => {
        if (res && !res.ok && res.error) onError?.(res.error)
      })
    },
    [],
  )

  const sendReaction = useCallback((kind: 'heart' = 'heart') => {
    socketRef.current?.emit('room-reaction', { kind })
    sessionRef.current.hearts += 1
  }, [])

  const reportRoom = useCallback(
    (reason: string, targetName?: string, onDone?: () => void) => {
      socketRef.current?.emit(
        'room-report',
        { reason, targetName },
        (res: { ok: boolean; error?: string }) => {
          if (res?.ok) onDone?.()
        },
      )
    },
    [],
  )

  const clearReaction = useCallback((id: string) => {
    setReactions((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const clearRemoved = useCallback(() => setRemoved(''), [])
  const clearRejoined = useCallback(() => setRejoined(''), [])

  /* ------------------------------ party games ------------------------------ */

  const quizStart = useCallback((onError?: (msg: string) => void) => {
    socketRef.current?.emit('quiz-start', (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok && res.error) onError?.(res.error)
    })
  }, [])

  const quizAnswer = useCallback((choice: number, onError?: (msg: string) => void) => {
    socketRef.current?.emit('quiz-answer', { choice }, (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok && res.error) onError?.(res.error)
    })
  }, [])

  const promptsStart = useCallback(
    (mode: 'truth' | 'dare' | 'rapid', onError?: (msg: string) => void) => {
      socketRef.current?.emit('prompts-start', { mode }, (res: { ok: boolean; error?: string }) => {
        if (res && !res.ok && res.error) onError?.(res.error)
      })
    },
    [],
  )

  const promptsNext = useCallback((onError?: (msg: string) => void) => {
    socketRef.current?.emit('prompts-next', (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok && res.error) onError?.(res.error)
    })
  }, [])

  const promptsEnd = useCallback(() => {
    socketRef.current?.emit('prompts-end')
  }, [])

  const antakshariStart = useCallback((onError?: (msg: string) => void) => {
    socketRef.current?.emit('antakshari-start', (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok && res.error) onError?.(res.error)
    })
  }, [])

  const antakshariDone = useCallback((song: string, onError?: (msg: string) => void) => {
    socketRef.current?.emit('antakshari-done', { song }, (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok && res.error) onError?.(res.error)
    })
  }, [])

  const antakshariEnd = useCallback(() => {
    socketRef.current?.emit('antakshari-end')
  }, [])

  return {
    connected,
    myId,
    room,
    lobbyRooms,
    inRoom,
    joinError,
    mediaError,
    micOn,
    camOn,
    remoteStreams,
    localStream,
    hasVideoTrack,
    applause,
    clearApplause,
    reactions,
    clearReaction,
    removed,
    clearRemoved,
    latency,
    rejoined,
    clearRejoined,
    quizStart,
    quizAnswer,
    promptsStart,
    promptsNext,
    promptsEnd,
    antakshariStart,
    antakshariDone,
    antakshariEnd,
    hasLocalStream: !!localStreamRef.current,
    localStreamRef,
    listRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleMic,
    toggleCam,
    sendChat,
    startActivity,
    startSingAlong,
    endSingAlong,
    endActivity,
    takeSeat,
    leaveSeat,
    award,
    hostMute,
    hostRemove,
    sendReaction,
    reportRoom,
    karaokeLoad,
    karaokePlay,
    karaokePause,
    karaokeSeek,
    karaokeEnded,
    karaokeQueueAdd,
    karaokeQueueRemove,
    clearJoinError: () => setJoinError(''),
    /** synchronous read of the last join failure (state can lag one render) */
    getJoinError: () => joinErrorRef.current,
  }
}
