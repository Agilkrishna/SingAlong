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
  micOn: boolean
  camOn: boolean
  isHost: boolean
  joinedAt: number
}

export interface ChatMessage {
  id: string
  type: 'user' | 'system'
  from?: string
  name?: string
  color?: string
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

export interface RoomSnapshot {
  id: string
  name: string
  state: string
  hostId: string
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
}

export interface JoinOptions {
  roomId: string
  state: string
  profile: { name: string; color: string }
  pid: string
  micOn: boolean
  camOn: boolean
}

export type MediaError = { kind: 'denied' | 'unavailable' | 'none'; message: string }

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
  const [mediaError, setMediaError] = useState<MediaError | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({})
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [hasVideoTrack, setHasVideoTrack] = useState(false)
  const [applause, setApplause] = useState<ApplauseEvent[]>([])

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
      })
      s.on('disconnect', () => setConnected(false))

      s.on('room-state', (data: { room: RoomSnapshot }) => {
        setRoom(data.room)
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
            ? { ...r, chat: [...r.chat, m].slice(-60) }
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
    })()

    return () => {
      disposed = true
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
    (name: string, state: string): Promise<string | null> => {
      return new Promise((resolve) => {
        socketRef.current?.emit('create-room', { name, state }, (res: { ok: boolean; roomId?: string; error?: string }) => {
          resolve(res?.ok ? res.roomId ?? null : null)
        })
      })
    },
    [],
  )

  const joinRoom = useCallback(
    async (opts: JoinOptions) => {
      setJoinError('')
      const gotMedia = await acquireLocalMedia(opts.camOn)
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
        }
        socket.emit('join-room', payload, (res: { ok: boolean; error?: string }) => {
          if (res?.ok) {
            setInRoom(true)
            resolve(true)
          } else {
            setJoinError(res?.error ?? 'Could not join room')
            resolve(false)
          }
        })
      })
    },
    [acquireLocalMedia],
  )

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('leave-room')
    setInRoom(false)
    setRoom(null)
    setRemoteStreams({})
    pcsRef.current.forEach((pc) => pc.close())
    pcsRef.current.clear()
    pendingIceRef.current.clear()
  }, [])

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return false
    const next = !micOn
    stream.getAudioTracks().forEach((t) => (t.enabled = next))
    setMicOn(next)
    socketRef.current?.emit('media-state', { micOn: next, camOn })
    return next
  }, [micOn, camOn])

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream || stream.getVideoTracks().length === 0) return false
    const next = !camOn
    stream.getVideoTracks().forEach((t) => (t.enabled = next))
    setCamOn(next)
    socketRef.current?.emit('media-state', { micOn, camOn: next })
    return next
  }, [micOn, camOn])

  const sendChat = useCallback((text: string) => {
    if (text.trim()) socketRef.current?.emit('chat', { text: text.trim() })
  }, [])

  /* ---------------------------- the Main Seat ------------------------------ */

  const takeSeat = useCallback((onError?: (msg: string) => void) => {
    socketRef.current?.emit('stage-take', (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok && res.error) onError?.(res.error)
    })
  }, [])

  const leaveSeat = useCallback(() => {
    socketRef.current?.emit('stage-leave')
  }, [])

  const award = useCallback((kind: ApplauseKind, onError?: (msg: string) => void) => {
    socketRef.current?.emit('stage-award', { kind }, (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok && res.error) onError?.(res.error)
    })
  }, [])

  const clearApplause = useCallback((id: string) => {
    setApplause((prev) => prev.filter((a) => a.id !== id))
  }, [])

  /* ------------------------------- karaoke -------------------------------- */

  const karaokeLoad = useCallback((videoId: string, title: string) => {
    socketRef.current?.emit('karaoke-load', { videoId, title })
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
  }, [])

  const karaokeQueueRemove = useCallback((index: number) => {
    socketRef.current?.emit('karaoke-queue-remove', { index })
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
    hasLocalStream: !!localStreamRef.current,
    localStreamRef,
    listRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleMic,
    toggleCam,
    sendChat,
    takeSeat,
    leaveSeat,
    award,
    karaokeLoad,
    karaokePlay,
    karaokePause,
    karaokeSeek,
    karaokeEnded,
    karaokeQueueAdd,
    karaokeQueueRemove,
    clearJoinError: () => setJoinError(''),
  }
}
