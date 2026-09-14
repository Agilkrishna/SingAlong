'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Headphones, Loader2, Mic } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useRoom, ApplauseKind, SessionRecap } from '@/hooks/use-room'
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
import { AVATARS } from '@/lib/avatars'
import {
  bumpStreak,
  streakLabel,
  getBadges,
  badgeInfo,
  awardTimeBadges,
  trackRoomVisit,
} from '@/lib/badges'
import { matchVibeFriends } from '@/lib/social'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LandingView } from '@/components/anthakshari/landing-view'
import { LobbyView } from '@/components/anthakshari/lobby-view'
import { RoomView } from '@/components/anthakshari/room-view'
import { RecapDialog } from '@/components/anthakshari/recap-dialog'

type View = 'landing' | 'lobby' | 'room'

interface PendingJoin {
  roomId: string
  name: string
  locked?: boolean
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
  const [joinPasscode, setJoinPasscode] = useState('')
  const [showPasscode, setShowPasscode] = useState(false)
  const [recap, setRecap] = useState<SessionRecap | null>(null)
  const [streak, setStreak] = useState(0)
  const lobbyPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vibeToastRoomRef = useRef<string>('')
  const { reactions, clearReaction, removed, clearRemoved } = roomApi
  const {
    rejoined,
    clearRejoined,
    latency,
    quizStart,
    quizAnswer,
    promptsStart,
    promptsNext,
    promptsEnd,
    antakshariStart,
    antakshariDone,
    antakshariEnd,
  } = roomApi

  // the host dropped us — say it out loud and return to the lobby
  useEffect(() => {
    if (!removed) return
    toast({ title: 'Removed from room', description: removed })
    roomApi.leaveRoom()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView('lobby')
    clearRemoved()
  }, [removed])

  // auto-rejoin after a network blip — one reassuring toast
  useEffect(() => {
    if (!rejoined) return
    toast({ title: 'Back online 🔁', description: rejoined })
    clearRejoined()
  }, [rejoined, clearRejoined, toast])

  // daily streak — counts a visit, once per load; time-of-day badges too
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStreak(bumpStreak().count)
    const fresh = awardTimeBadges()
    if (fresh.length > 0) {
      const emojis = fresh.map((s) => badgeInfo(s)?.emoji ?? '').join(' ')
      toast({ title: `${emojis} Badge unlocked!`, description: 'See your badges in the join dialog.' })
    }
  }, [toast])

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
  const requestJoin = useCallback((roomId: string, knownName?: string, locked?: boolean) => {
    setPendingJoin((prev) =>
      prev ?? { roomId, name: knownName || `Room code ${roomId}`, locked },
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
      roomId.startsWith('state:') ? `${stateName} Hangout` : undefined,
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
        passcode:
          showPasscode || pendingJoin.locked ? joinPasscode || undefined : undefined,
      })
      setJoining(false)
      if (ok) {
        setPendingJoin(null)
        setJoinPasscode('')
        setShowPasscode(false)
        setView('room')
      } else {
        // locked rooms flip the passcode input open so the retry is one tap
        // (read the ref — the state value can lag one render behind the await)
        if (/locked/i.test(roomApi.getJoinError())) {
          setShowPasscode(true)
        } else {
          setPendingJoin(null)
          setShowPasscode(false)
        }
        toast({ title: 'Could not join', description: roomApi.getJoinError() || 'Try again' })
      }
    },
    [pendingJoin, profile, joining, roomApi, state, toast, showPasscode, joinPasscode],
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
    async (
      name: string,
      kind: 'hangout' | 'sing' = 'hangout',
      tags: string[] = [],
      passcode?: string,
      scheduleAt?: number,
    ) => {
      if (!profile) return
      setCreating(true)
      const roomId = await roomApi.createRoom(name, state, kind, tags, passcode, scheduleAt)
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
    // leaving hands back the session stats → recap card
    const stats = roomApi.leaveRoom()
    setRecap(stats)
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

  // vibe-friend reunion — fires once per room when a saved friend is present
  useEffect(() => {
    if (view !== 'room' || !room?.id) return
    if (vibeToastRoomRef.current === room.id) return
    vibeToastRoomRef.current = room.id
    const friends = matchVibeFriends(room.participants.map((p) => p.name))
    if (friends.length > 0) {
      toast({
        title: '🎉 Your vibe friend is here!',
        description: friends.map((f) => f.name).join(', '),
      })
    }
    // room-visit tracking (Social Butterfly badge)
    const fresh = trackRoomVisit(room.id)
    if (fresh.length > 0) {
      toast({ title: '🦋 Badge unlocked: Social Butterfly!', description: '5 rooms visited on this device.' })
    }
  }, [view, room, toast])

  /* -------------------------------- render -------------------------------- */

  if (!profile) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#141414]">
        <span className="text-3xl font-black tracking-tighter text-[#E50914]">DESI&nbsp;HANGOUT</span>
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
          onJoin={(roomId) => {
            const r = lobbyRooms.find((room) => room.id === roomId)
            requestJoin(roomId, r?.name, r?.locked)
          }}
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
          reactions={reactions}
          onClearReaction={clearReaction}
          onToggleMic={() => roomApi.toggleMic(mediaError2Toast)}
          onToggleCam={() => roomApi.toggleCam(mediaError2Toast)}
          onSendChat={roomApi.sendChat}
          onTakeSeat={handleTakeSeat}
          onLeaveSeat={roomApi.leaveSeat}
          onAward={handleAward}
          onHostMute={(targetId, muted) =>
            roomApi.hostMute(targetId, muted, (msg) => toast({ title: 'Host controls', description: msg }))
          }
          onHostRemove={(targetId) =>
            roomApi.hostRemove(targetId, (msg) => toast({ title: 'Host controls', description: msg }))
          }
          latency={latency}
          onQuizStart={() =>
            quizStart((msg) => toast({ title: 'Quiz', description: msg }))
          }
          onQuizAnswer={(choice) =>
            quizAnswer(choice, (msg) => toast({ title: 'Quiz', description: msg }))
          }
          onPromptsStart={(mode) =>
            promptsStart(mode, (msg) => toast({ title: 'Party games', description: msg }))
          }
          onPromptsNext={() =>
            promptsNext((msg) => toast({ title: 'Party games', description: msg }))
          }
          onPromptsEnd={promptsEnd}
          onAntakshariStart={() =>
            antakshariStart((msg) => toast({ title: 'Antakshari', description: msg }))
          }
          onAntakshariDone={(song) =>
            antakshariDone(song, (msg) => toast({ title: 'Antakshari', description: msg }))
          }
          onAntakshariEnd={antakshariEnd}
          onSendReaction={() => roomApi.sendReaction('heart')}
          onReport={(reason, targetName) => {
            roomApi.reportRoom(reason, targetName)
            toast({ title: 'Report sent', description: 'Moderators will review this room. Thank you.' })
          }}
          onLeave={handleLeave}
          onKaraokeLoad={roomApi.karaokeLoad}
          onKaraokePlay={roomApi.karaokePlay}
          onKaraokePause={roomApi.karaokePause}
          onKaraokeSeek={roomApi.karaokeSeek}
          onKaraokeEnded={roomApi.karaokeEnded}
          onKaraokeQueueAdd={roomApi.karaokeQueueAdd}
          onKaraokeQueueRemove={roomApi.karaokeQueueRemove}
          onStartSingAlong={() =>
            roomApi.startActivity('sing', (msg) => toast({ title: 'Sing Along', description: msg }))
          }
          onListenTogether={() =>
            roomApi.startActivity('listen', (msg) => toast({ title: 'Listen Together', description: msg }))
          }
          onWatchParty={() =>
            roomApi.startActivity('watch', (msg) => toast({ title: 'Watch Party', description: msg }))
          }
          onEndActivity={roomApi.endActivity}
        />
      )}

      {/* session recap card — shown after leaving a room */}
      <RecapDialog open={!!recap} onOpenChange={(open) => !open && setRecap(null)} recap={recap} />

      {/* pre-join choice — the PRIMARY action joins with mic & camera, so the
          browser permission prompt fires right as you join. Listeners who
          explicitly don't want the prompt use the quiet option below.
          The built-in ✕ (and overlay click) cancels and stays in the lobby. */}
      <Dialog
        open={!!pendingJoin}
        onOpenChange={(open) => {
          if (!open) {
            setPendingJoin(null)
            setShowPasscode(false)
            setJoinPasscode('')
          }
        }}
      >
        <DialogContent
          className="max-h-[90dvh] max-w-sm gap-4 overflow-y-auto rounded-2xl border-neutral-800 bg-[#141414]"
          data-testid="join-dialog"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white">Join this hangout?</DialogTitle>
            <DialogDescription className="text-xs text-neutral-400" data-testid="join-dialog-room">
              {pendingJoin?.name}
              {state ? ` · ${state}` : ''} — we&apos;ll ask for mic &amp; camera as you join
            </DialogDescription>
          </DialogHeader>

          {/* avatar picker — anonymous but expressive */}
          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
              Pick your avatar
            </p>
            <div className="flex flex-wrap gap-1.5" data-testid="avatar-picker">
              {AVATARS.map((a, idx) => {
                const on = (profile?.avatar ?? '') === a
                return (
                  <button
                    key={a}
                    onClick={() =>
                      setProfile((p) => {
                        if (!p) return p
                        const next = { ...p, avatar: on ? '' : a }
                        saveProfile(next)
                        return next
                      })
                    }
                    aria-pressed={on}
                    aria-label={`Avatar ${a}`}
                    data-testid={`avatar-${idx}`}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition ${
                      on
                        ? 'bg-[#E50914] shadow-lg shadow-[#E50914]/30'
                        : 'bg-neutral-800 hover:bg-neutral-700'
                    }`}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          </div>

          {/* streak + badges — your device-local achievements */}
          <p className="text-[11px] text-neutral-400" data-testid="streak-line">
            {streakLabel(streak)}
            {getBadges().length > 0 && (
              <span className="ml-2">
                {getBadges()
                  .map((slug) => badgeInfo(slug)?.emoji ?? '')
                  .join(' ')}
              </span>
            )}
          </p>

          {/* passcode — appears for locked rooms (or after a locked error) */}
          {(showPasscode || pendingJoin?.locked) && (
            <div data-testid="passcode-box">
              <Input
                value={joinPasscode}
                onChange={(e) => setJoinPasscode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Room passcode (digits)"
                inputMode="numeric"
                autoFocus
                data-testid="join-passcode-input"
                className="h-10 border-neutral-700 bg-neutral-800/80 text-center font-mono text-sm tracking-[0.4em] text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-neutral-500"
                aria-label="Room passcode"
                onKeyDown={(e) => e.key === 'Enter' && joinPasscode && confirmJoin(true)}
              />
              <p className="mt-1 text-[10px] text-neutral-500">
                🔒 This room is locked — ask the host for the code.
              </p>
            </div>
          )}

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
                permission — allow it once and you&apos;re ready to talk &amp; sing.
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
                Listener mode — chat, watch &amp; applaud. No permission prompt.
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
