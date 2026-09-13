'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Headphones, Loader2, Mic } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useRoom, ApplauseKind } from '@/hooks/use-room'
import {
  loadProfile,
  saveProfile,
  generateAnonymousProfile,
  hasStoredProfile,
  detectStateFromCoords,
  stateByName,
  AnonymousProfile,
} from '@/lib/indian-states'
import { stateFromSlug } from '@/lib/invite'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LandingView } from '@/components/anthakshari/landing-view'
import { LobbyView } from '@/components/anthakshari/lobby-view'
import { RoomView } from '@/components/anthakshari/room-view'

type View = 'landing' | 'lobby' | 'room'

interface PendingJoin {
  roomId: string
  name: string
}

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
  const [pendingJoin, setPendingJoin] = useState<PendingJoin | null>(null)
  const [joining, setJoining] = useState(false)
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

  // step 1 — the lobby asks HOW to join (singer / listener) before touching
  // the camera; the dialog's ✕ cancels and stays in the lobby
  const requestJoin = useCallback((roomId: string, knownName?: string) => {
    setPendingJoin((prev) =>
      prev ?? { roomId, name: knownName || `Room code ${roomId}` },
    )
  }, [])

  // WhatsApp invite deep link — /?room=<roomId>&s=<State> drops the invitee
  // straight into the join dialog for that room. Consumed once, then stripped
  // from the address bar so a refresh doesn't re-open the invite.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const roomId = params.get('room')?.trim().slice(0, 64)
    if (!roomId) return
    const s = params.get('s')
    const stateName =
      (s && stateByName(s)?.name) ||
      (roomId.startsWith('state:') ? stateFromSlug(roomId.slice(6)) : null) ||
      'Delhi'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(stateName)
    setView('lobby')
    requestJoin(
      roomId,
      roomId.startsWith('state:') ? `${stateName} Singers` : undefined,
    )
    window.history.replaceState(null, '', window.location.pathname)
  }, [requestJoin])

  // step 2 — actually connect with the chosen media mode
  const confirmJoin = useCallback(
    async (asSinger: boolean) => {
      if (!pendingJoin || !profile || joining) return
      setJoining(true)
      const ok = await roomApi.joinRoom({
        roomId: pendingJoin.roomId,
        state,
        profile,
        pid: profile.pid,
        micOn: asSinger,
        camOn: asSinger,
      })
      setJoining(false)
      setPendingJoin(null)
      if (ok) {
        setView('room')
      } else {
        toast({ title: 'Could not join', description: roomApi.joinError || 'Try again' })
      }
    },
    [pendingJoin, profile, joining, roomApi, state, toast],
  )

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

  const handleCreateRoom = useCallback(
    async (name: string) => {
      if (!profile) return
      setCreating(true)
      const roomId = await roomApi.createRoom(name, state)
      setCreating(false)
      if (roomId) {
        requestJoin(roomId, name)
      } else {
        toast({ title: 'Could not create room', description: 'Please try again.' })
      }
    },
    [profile, roomApi, state, requestJoin, toast],
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
    (onSuccess?: () => void) => roomApi.takeSeat({ onError: seatError, onSuccess }),
    [roomApi, seatError],
  )

  const mediaError2Toast = useCallback(
    (msg: string) => toast({ title: 'Microphone & camera', description: msg }),
    [toast],
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
          onJoin={(roomId) => requestJoin(roomId, lobbyRooms.find((r) => r.id === roomId)?.name)}
          onCreateRoom={handleCreateRoom}
          onJoinByCode={(code) => requestJoin(code)}
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
          onToggleMic={() => roomApi.toggleMic(mediaError2Toast)}
          onToggleCam={() => roomApi.toggleCam(mediaError2Toast)}
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

      {/* pre-join choice — the PRIMARY action joins with mic & camera, so the
          browser permission prompt fires right as you join. Listeners who
          explicitly don't want the prompt use the quiet option below.
          The built-in ✕ (and overlay click) cancels and stays in the lobby. */}
      <Dialog open={!!pendingJoin} onOpenChange={(open) => !open && setPendingJoin(null)}>
        <DialogContent
          className="max-w-sm rounded-2xl border-neutral-800 bg-[#141414] gap-4"
          data-testid="join-dialog"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white">Join this stage?</DialogTitle>
            <DialogDescription className="text-xs text-neutral-400" data-testid="join-dialog-room">
              {pendingJoin?.name}
              {state ? ` · ${state}` : ''} — we&apos;ll ask for mic &amp; camera as you join
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => confirmJoin(true)}
              disabled={joining}
              data-testid="join-singer"
              className="rounded-xl border border-[#E50914]/60 bg-[#E50914]/15 p-4 text-left transition hover:bg-[#E50914]/25 disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-sm font-black text-white">
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#E50914]" />
                ) : (
                  <Mic className="h-4 w-4 text-[#E50914]" />
                )}
                Join room
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-neutral-400">
                Your browser will ask for <b className="text-neutral-200">audio &amp; video</b>{' '}
                permission — allow it once and you&apos;re ready for the Main Seat.
              </span>
            </button>
            <button
              onClick={() => confirmJoin(false)}
              disabled={joining}
              data-testid="join-listener"
              className="rounded-lg border border-neutral-800 bg-transparent px-3 py-2.5 text-left transition hover:border-neutral-600 disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-xs font-black text-neutral-300">
                {joining ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
                ) : (
                  <Headphones className="h-3.5 w-3.5 text-neutral-400" />
                )}
                Join without mic &amp; camera
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-500">
                Listener mode — watch, chat &amp; applaud. No permission prompt.
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
