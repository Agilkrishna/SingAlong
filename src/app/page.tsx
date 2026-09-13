'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useRoom, ApplauseKind } from '@/hooks/use-room'
import {
  loadProfile,
  saveProfile,
  generateAnonymousProfile,
  hasStoredProfile,
  detectStateFromCoords,
  AnonymousProfile,
} from '@/lib/indian-states'
import { LandingView } from '@/components/anthakshari/landing-view'
import { LobbyView } from '@/components/anthakshari/lobby-view'
import { RoomView } from '@/components/anthakshari/room-view'

type View = 'landing' | 'lobby' | 'room'

export default function Home() {
  const { toast } = useToast()
  const roomApi = useRoom()
  const {
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
  } = roomApi

  const [view, setView] = useState<View>('landing')
  const [profile, setProfile] = useState<AnonymousProfile | null>(null)
  const [welcomeBack, setWelcomeBack] = useState(false)
  const [state, setState] = useState<string>('')
  const [detecting, setDetecting] = useState(false)
  const [detectNote, setDetectNote] = useState('')
  const [creating, setCreating] = useState(false)
  const lobbyPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // hydrate stored profile (client only, after mount to avoid SSR mismatch).
  // the saved stage name is auto-populated here — returning users skip typing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(loadProfile())
    setWelcomeBack(hasStoredProfile())
  }, [])

  // media permission notice
  useEffect(() => {
    if (mediaError && inRoom) {
      toast({
        title: mediaError.kind === 'denied' ? 'Media blocked' : 'No devices',
        description: mediaError.message,
      })
    }
  }, [mediaError, inRoom, toast])

  const enterLobby = useCallback((stateName: string) => {
    setState(stateName)
    setView('lobby')
  }, [])

  // poll room list while in lobby
  useEffect(() => {
    if (view !== 'lobby' || !state) return
    roomApi.listRooms(state)
    lobbyPollRef.current = setInterval(() => roomApi.listRooms(state), 5000)
    return () => {
      if (lobbyPollRef.current) clearInterval(lobbyPollRef.current)
      lobbyPollRef.current = null
    }
  }, [view, state, roomApi.listRooms])

  /* ------------------------------ handlers -------------------------------- */

  const handleDetectLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setDetectNote('Geolocation is not supported on this device — please pick your state below.')
      return
    }
    setDetecting(true)
    setDetectNote('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetecting(false)
        const detected = detectStateFromCoords(pos.coords.latitude, pos.coords.longitude)
        if (detected) {
          setDetectNote(`📍 You're in ${detected} — opening its stage…`)
          setTimeout(() => enterLobby(detected), 600)
        } else {
          setDetectNote(
            'Looks like you\'re outside India right now — pick any state below to join its stage.',
          )
        }
      },
      (err) => {
        setDetecting(false)
        setDetectNote(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — no problem, pick your state below.'
            : 'Couldn\'t read your location — pick your state below.',
        )
      },
      { timeout: 8000, maximumAge: 300000 },
    )
  }, [enterLobby])

  const handleRename = useCallback((name: string) => {
    setProfile((p) => {
      const next = { ...(p ?? { pid: '', name: '', color: '#E50914' }), name }
      saveProfile(next)
      return next
    })
  }, [])

  const handleShuffle = useCallback(() => {
    const fresh = generateAnonymousProfile()
    saveProfile(fresh)
    setProfile(fresh)
    setWelcomeBack(true)
  }, [])

  const handleJoin = useCallback(
    async (roomId: string) => {
      if (!profile) return
      const ok = await roomApi.joinRoom({
        roomId,
        state,
        profile,
        pid: profile.pid,
        micOn: true,
        camOn: true,
      })
      if (ok) {
        setView('room')
      } else {
        toast({ title: 'Could not join', description: roomApi.joinError || 'Try again' })
      }
    },
    [profile, roomApi, state, toast],
  )

  const handleCreateRoom = useCallback(
    async (name: string) => {
      if (!profile) return
      setCreating(true)
      const roomId = await roomApi.createRoom(name, state)
      setCreating(false)
      if (roomId) {
        handleJoin(roomId)
      } else {
        toast({ title: 'Could not create room', description: 'Please try again.' })
      }
    },
    [profile, roomApi, state, handleJoin, toast],
  )

  const handleLeave = useCallback(() => {
    roomApi.leaveRoom()
    setView('lobby')
  }, [roomApi])

  const awardError = useCallback(
    (msg: string) => toast({ title: 'Applause', description: msg }),
    [toast],
  )

  const seatError = useCallback(
    (msg: string) => toast({ title: 'Main Seat', description: msg }),
    [toast],
  )

  const handleAward = useCallback(
    (kind: ApplauseKind) => roomApi.award(kind, awardError),
    [roomApi, awardError],
  )

  const handleTakeSeat = useCallback(
    () => roomApi.takeSeat(seatError),
    [roomApi, seatError],
  )

  /* -------------------------------- render -------------------------------- */

  if (!profile) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#141414]">
        <span className="text-3xl font-black tracking-tighter text-[#E50914]">SING ALONG</span>
      </main>
    )
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[#141414] text-white">
      {view === 'landing' && (
        <LandingView
          profile={profile}
          welcomeBack={welcomeBack}
          onShuffleProfile={handleShuffle}
          onRename={handleRename}
          onPickState={enterLobby}
          onDetectLocation={handleDetectLocation}
          detecting={detecting}
          detectNote={detectNote}
        />
      )}

      {view === 'lobby' && (
        <LobbyView
          state={state || 'Delhi'}
          rooms={lobbyRooms}
          loading={creating}
          joinError={joinError}
          onBack={() => setView('landing')}
          onRefresh={() => state && roomApi.listRooms(state)}
          onJoin={handleJoin}
          onCreateRoom={handleCreateRoom}
          onJoinByCode={(code) => handleJoin(code)}
        />
      )}

      {view === 'room' && room && (
        <RoomView
          room={room}
          myId={myId}
          connected={connected}
          micOn={micOn}
          camOn={camOn}
          hasCam={hasVideoTrack}
          remoteStreams={remoteStreams}
          localStream={localStream}
          applause={applause}
          onClearApplause={roomApi.clearApplause}
          onToggleMic={() => roomApi.toggleMic()}
          onToggleCam={() => roomApi.toggleCam()}
          onSendChat={roomApi.sendChat}
          onTakeSeat={handleTakeSeat}
          onLeaveSeat={roomApi.leaveSeat}
          onAward={handleAward}
          onLeave={handleLeave}
          onKaraokeLoad={roomApi.karaokeLoad}
          onKaraokePlay={roomApi.karaokePlay}
          onKaraokePause={roomApi.karaokePause}
          onKaraokeSeek={roomApi.karaokeSeek}
          onKaraokeEnded={roomApi.karaokeEnded}
          onKaraokeQueueAdd={roomApi.karaokeQueueAdd}
          onKaraokeQueueRemove={roomApi.karaokeQueueRemove}
        />
      )}
    </main>
  )
}
