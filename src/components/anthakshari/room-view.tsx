'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { VideoTile } from './video-tile'
import { RoomControls } from './room-controls'
import { StagePanel, QuickAwardButtons } from './stage-panel'
import { ChatPanel } from './chat-panel'
import { KaraokePanel } from './karaoke-panel'
import { ApplauseBursts } from './applause-bursts'
import { FloatingHearts } from './floating-hearts'
import { PeoplePanel } from './people-panel'
import { ReportDialog } from './report-dialog'
import { GamesPanel } from './games-panel'
import { ShareInviteButton } from './share-invite'
import {
  RoomSnapshot,
  ChatMessage,
  KaraokeState,
  ApplauseEvent,
  ApplauseKind,
  ReactionEvent,
} from '@/hooks/use-room'
import { useLang } from '@/lib/i18n'
import { vibeLabel } from '@/lib/vibes'

export type SidePanel = 'stage' | 'chat' | 'karaoke' | 'games' | null

const DATA_SAVER_KEY = 'dh:datasaver'
const BLOCKLIST_KEY = 'dh:blocklist'

interface RoomViewProps {
  room: RoomSnapshot
  myId: string
  connected: boolean
  micOn: boolean
  camOn: boolean
  hasCam: boolean
  remoteStreams: Record<string, MediaStream>
  localStream: MediaStream | null
  applause: ApplauseEvent[]
  onClearApplause: (id: string) => void
  reactions: ReactionEvent[]
  onClearReaction: (id: string) => void
  onToggleMic: () => void
  onToggleCam: () => void
  onSendChat: (text: string) => void
  /** shared activities — the whole room flips layouts together */
  onStartSingAlong: () => void
  onListenTogether: () => void
  onWatchParty: () => void
  onEndActivity: () => void
  /** onSuccess fires when the server confirms the seat — RoomView closes the side panel so the main room is visible */
  onTakeSeat: (onSuccess?: () => void) => void
  onLeaveSeat: () => void
  onAward: (kind: ApplauseKind) => void
  /** host controls (server-enforced) */
  onHostMute: (targetId: string, muted: boolean) => void
  onHostRemove: (targetId: string) => void
  /** network quality — socket round-trip ms (null until first probe) */
  latency: number | null
  /** party games */
  onQuizStart: () => void
  onQuizAnswer: (choice: number) => void
  onPromptsStart: (mode: 'truth' | 'dare' | 'rapid') => void
  onPromptsNext: () => void
  onPromptsEnd: () => void
  onAntakshariStart: () => void
  onAntakshariDone: (song: string) => void
  onAntakshariEnd: () => void
  /** floating hearts — no points, every activity */
  onSendReaction: () => void
  /** abuse report → moderators */
  onReport: (reason: string, targetName?: string) => void
  onLeave: () => void
  onKaraokeLoad: (videoId: string, title: string) => void
  onKaraokePlay: (position: number) => void
  onKaraokePause: (position: number) => void
  onKaraokeSeek: (position: number) => void
  onKaraokeEnded: () => void
  onKaraokeQueueAdd: (videoId: string, title: string) => void
  onKaraokeQueueRemove: (index: number) => void
}

export function RoomView({
  room,
  myId,
  connected,
  micOn,
  camOn,
  hasCam,
  remoteStreams,
  localStream,
  applause,
  onClearApplause,
  reactions,
  onClearReaction,
  onToggleMic,
  onToggleCam,
  onSendChat,
  onStartSingAlong,
  onListenTogether,
  onWatchParty,
  onEndActivity,
  onTakeSeat,
  onLeaveSeat,
  onAward,
  onHostMute,
  onHostRemove,
  onSendReaction,
  onReport,
  latency,
  onQuizStart,
  onQuizAnswer,
  onPromptsStart,
  onPromptsNext,
  onPromptsEnd,
  onAntakshariStart,
  onAntakshariDone,
  onAntakshariEnd,
  onLeave,
  onKaraokeLoad,
  onKaraokePlay,
  onKaraokePause,
  onKaraokeSeek,
  onKaraokeEnded,
  onKaraokeQueueAdd,
  onKaraokeQueueRemove,
}: RoomViewProps) {
  const { t } = useLang()
  const [panel, setPanel] = useState<SidePanel>('stage')
  const [seenCount, setSeenCount] = useState(0)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [dataSaver, setDataSaver] = useState(false)
  const [blocked, setBlocked] = useState<string[]>([])

  // hydrate persisted preferences (client only, after mount — no SSR mismatch)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDataSaver(window.localStorage.getItem(DATA_SAVER_KEY) === '1')
      const raw = window.localStorage.getItem(BLOCKLIST_KEY)
      const list: unknown = raw ? JSON.parse(raw) : []
      if (Array.isArray(list)) {
         
        setBlocked(list.map((n) => String(n).toLowerCase()))
      }
    } catch {}
  }, [])

  const toggleDataSaver = () => {
    const next = !dataSaver
    setDataSaver(next)
    try {
      window.localStorage.setItem(DATA_SAVER_KEY, next ? '1' : '0')
    } catch {}
    // audio-first: turning Data Saver on drops your own camera uplink right away
    if (next && camOn) onToggleCam()
  }

  const blockUser = (name: string) => {
    const key = name.trim().toLowerCase()
    if (!key) return
    setBlocked((prev) => {
      if (prev.includes(key)) return prev
      const next = [...prev, key]
      try {
        window.localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const unblockUser = (name: string) => {
    const key = name.trim().toLowerCase()
    setBlocked((prev) => {
      const next = prev.filter((n) => n !== key)
      try {
        window.localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // side-panel width — shrink / expand to taste (the karaoke search + player
  // benefit the most: wide shows bigger video & search, compact keeps the
  // video grid visible while a track plays)
  const [panelSize, setPanelSize] = useState<'compact' | 'normal' | 'wide'>('normal')
  const growPanel = () =>
    setPanelSize((s) => (s === 'compact' ? 'normal' : s === 'normal' ? 'wide' : s))
  const shrinkPanel = () =>
    setPanelSize((s) => (s === 'wide' ? 'normal' : s === 'normal' ? 'compact' : s))
  const panelWidthClass =
    panelSize === 'wide'
      ? 'max-w-full sm:max-w-[40rem]' // phones: full width · desktop: roomy 40rem
      : panelSize === 'compact'
        ? 'max-w-[19rem]'
        : 'max-w-sm'

  const karaoke: KaraokeState | null = room.karaoke
  const stage = room.stage
  const iAmOnSeat = !!stage && stage.singerId === myId

  // 'chat' = plain hangout (default) · 'sing' = Sing Along activity ·
  // 'listen' | 'watch' = shared-media activities. The server always sends
  // activity; the fallback keeps stale snapshots harmless.
  const activity = room.activity ?? 'chat'
  const singMode = activity === 'sing'
  const mediaMode = activity === 'listen' || activity === 'watch'
  // the side panel exists whenever an activity is running — or when party
  // games are open in a plain hangout (games don't flip the whole room)
  const panelAvailable = activity !== 'chat' || panel === 'games'
  const panelOpen = panel !== null

  // the Main Seat panel is meaningless outside Sing Along
  const effectivePanel: SidePanel = panel === 'stage' && !singMode ? 'chat' : panel

  // when the Sing Along starts (even by someone else), open on the Main Seat
  // panel; when Listen Together / Watch Party starts, open the media picker
  useEffect(() => {
    if (singMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanel('stage')
      setSeenCount(room.chat.length)
    }
  }, [singMode])  

  useEffect(() => {
    if (mediaMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanel('karaoke')
      setSeenCount(room.chat.length)
    }
  }, [mediaMode])  

  // unread badge: derived — seenCount is refreshed in the toggle handler (event)
  const unread = Math.max(0, room.chat.length - seenCount)

  const chat: ChatMessage[] = useMemo(() => room.chat.slice(-60), [room.chat])

  const participants = room.participants

  // mini now-playing bar shows whenever a track exists and the karaoke panel is closed
  const showMiniPlayer = !!karaoke?.videoId && effectivePanel !== 'karaoke'
  const toggleMiniPlayback = () => {
    if (!karaoke?.videoId) return
    if (karaoke.playing) onKaraokePause(karaoke.positionAt)
    else onKaraokePlay(karaoke.positionAt)
  }

  // Data Saver: suppress video streams (audio-first) — VideoTile falls back to avatars
  const streamFor = (id: string, isLocal: boolean): MediaStream | undefined => {
    if (dataSaver) return undefined
    return isLocal ? (localStream ?? undefined) : remoteStreams[id]
  }

  /* --------------------------- side panel (shared) ------------------------ */

  const aside = panelAvailable ? (
    <aside
      className={`absolute inset-y-0 right-0 z-20 flex w-full ${panelWidthClass} transform flex-col border-l border-neutral-800 bg-[#141414] transition-all duration-300 ease-out ${
        panelOpen ? 'translate-x-0' : 'translate-x-full'
      } ${showMiniPlayer ? 'pb-[70px]' : ''}`}
      data-testid="side-panel"
      data-panel-size={panelSize}
    >
      {/* shrink / expand / close handle — sits on the panel's left edge.
          The ✕ matters most on phones, where the panel covers the whole
          screen and this is the way back to the video grid. */}
      {panelOpen && (
        <div
          className="absolute left-0 top-1/2 z-30 flex -translate-x-full -translate-y-1/2 flex-col overflow-hidden rounded-l-lg border border-r-0 border-neutral-800 bg-[#141414]/95 shadow-lg shadow-black/50 backdrop-blur"
          data-testid="panel-resize-handle"
        >
          <button
            onClick={() => setPanel(null)}
            aria-label="Close panel — back to the stage"
            title="Close panel"
            data-testid="panel-close"
            className="flex h-10 w-8 items-center justify-center text-neutral-400 transition hover:bg-[#E50914] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="h-px w-full bg-neutral-800" />
          <button
            onClick={growPanel}
            disabled={panelSize === 'wide'}
            aria-label="Expand panel"
            title="Expand panel"
            data-testid="panel-expand"
            className="flex h-10 w-8 items-center justify-center text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <div className="h-px w-full bg-neutral-800" />
          <button
            onClick={shrinkPanel}
            disabled={panelSize === 'compact'}
            aria-label="Shrink panel"
            title="Shrink panel"
            data-testid="panel-shrink"
            className="flex h-10 w-8 items-center justify-center text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* karaoke stays mounted so playback keeps running across tab switches */}
      <div className={effectivePanel === 'karaoke' ? 'flex h-full min-h-0 flex-col' : 'hidden'}>
        <KaraokePanel
          karaoke={karaoke}
          myId={myId}
          panelVisible={effectivePanel === 'karaoke'}
          onLoad={onKaraokeLoad}
          onPlay={onKaraokePlay}
          onPause={onKaraokePause}
          onSeek={onKaraokeSeek}
          onEnded={onKaraokeEnded}
          onQueueAdd={onKaraokeQueueAdd}
          onQueueRemove={onKaraokeQueueRemove}
        />
      </div>
      {effectivePanel === 'chat' && (
        <ChatPanel
          messages={chat}
          myId={myId}
          onSend={onSendChat}
          blockedNames={blocked}
          onBlock={blockUser}
          onHeart={onSendReaction}
        />
      )}
      {effectivePanel === 'stage' && (
        <StagePanel
          stage={stage}
          participants={participants}
          myId={myId}
          onTakeSeat={(onSuccess?: () => void) =>
            onTakeSeat(() => {
              onSuccess?.()
              // seated! drop the side panel so the main room (video grid)
              // is in front of the singer right away
              setPanel(null)
            })
          }
          onLeaveSeat={onLeaveSeat}
          onAward={onAward}
          antakshari={room.antakshari ?? null}
          onAntakshariStart={onAntakshariStart}
          onAntakshariDone={onAntakshariDone}
          onAntakshariEnd={onAntakshariEnd}
        />
      )}
      {effectivePanel === 'games' && (
        <GamesPanel
          room={room}
          myId={myId}
          onQuizStart={onQuizStart}
          onQuizAnswer={onQuizAnswer}
          onPromptsStart={onPromptsStart}
          onPromptsNext={onPromptsNext}
          onPromptsEnd={onPromptsEnd}
        />
      )}
    </aside>
  ) : null

  /* -------------------------------- render -------------------------------- */

  return (
    <div className="flex h-[100dvh] flex-col bg-[#141414] text-white">
      {/* top bar */}
      <header className="flex items-center gap-3 border-b border-neutral-800 bg-black/40 px-4 py-2.5">
        <span className="text-lg font-black tracking-tighter text-[#E50914] sm:text-xl">
          DESI&nbsp;HANGOUT
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5" >
            <span className="truncate text-xs font-bold text-white sm:text-sm" data-testid="room-title">
              {room.name}
            </span>
            {room.kind === 'sing' && (
              <span
                data-testid="room-kind-chip"
                className="shrink-0 rounded bg-[#E50914]/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#ff6b6b]"
              >
                🎤 Singing room
              </span>
            )}
          </p>
          <p className="truncate text-[10px] uppercase tracking-widest text-neutral-500" data-testid="room-subtitle">
            {room.state} · room code {room.id.replace('state:', '').toUpperCase()}
            {(room.tags?.length ?? 0) > 0 && (
              <span className="ml-1.5 normal-case tracking-normal text-neutral-400">
                · {room.tags!.map((tag) => vibeLabel(tag)).join(' · ')}
              </span>
            )}
            {stage && <span className="ml-1.5 text-[#E50914]">· 🎤 {stage.singerName} on the Main Seat</span>}
          </p>
        </div>
        <ShareInviteButton
          roomId={room.id}
          roomName={room.name}
          stateName={room.state}
          variant="icon"
        />
        <button
          onClick={() => setPeopleOpen(true)}
          aria-label="People and safety"
          title="People & safety"
          data-testid="people-btn"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-800/80 px-2.5 py-1 text-[11px] font-bold text-neutral-300 transition hover:bg-neutral-700 hover:text-white"
        >
          <Users className="h-3.5 w-3.5" />
          {participants.length}/8
        </button>
        {dataSaver && (
          <span
            data-testid="data-saver-chip"
            title="Data Saver is on — audio first"
            className="shrink-0 rounded-full bg-green-500/15 px-2 py-1 text-[10px] font-black text-green-400"
          >
            📶
          </span>
        )}
        {/* network quality — tap toggles Data Saver (voice-only quick access) */}
        <button
          onClick={toggleDataSaver}
          aria-label={
            latency == null
              ? 'Network quality — measuring'
              : latency <= 200
                ? 'Network strong — tap for Data Saver'
                : latency <= 450
                  ? 'Network okay — tap for Data Saver'
                  : 'Network weak — tap for Data Saver'
          }
          title="Network quality — tap for voice-only (Data Saver)"
          data-testid="net-chip"
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black transition ${
            latency == null
              ? 'bg-neutral-800/80 text-neutral-400'
              : latency <= 200
                ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                : latency <= 450
                  ? 'bg-[#F5A623]/15 text-[#F5A623] hover:bg-[#F5A623]/25'
                  : 'bg-[#E50914]/15 text-[#ff6b6b] hover:bg-[#E50914]/25'
          }`}
        >
          {latency == null ? '📶 ·' : latency <= 200 ? '📶·g' : latency <= 450 ? '📶·ok' : '📶·poor'}
        </button>
        <span aria-label={connected ? 'connected' : 'disconnected'}>
          {connected ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-[#E50914]" />
          )}
        </span>
      </header>

      {/* daily icebreaker — every room, every day, one conversation starter */}
      {activity !== 'sing' && room.prompt && (
        <p
          className="border-b border-neutral-800/70 bg-neutral-900/40 px-4 py-1.5 text-[11px] leading-snug text-neutral-400"
          data-testid="icebreaker"
        >
          <span className="font-black uppercase tracking-widest text-neutral-500">
            {t('icebreaker')}:
          </span>{' '}
          <span className="text-neutral-300">{room.prompt}</span>
          {room.quiz && (
            <button
              onClick={() => setPanel('games')}
              data-testid="quiz-chip"
              className="ml-2 rounded-full bg-[#E50914]/20 px-2 py-0.5 text-[10px] font-black text-[#ff6b6b] transition hover:bg-[#E50914]/35"
            >
              🎲 Quiz live — Q{room.quiz.index + 1}/{room.quiz.total} · open
            </button>
          )}
        </p>
      )}

      {/* Sing Along activity bar — everyone sees it while the activity runs */}
      {singMode && (
        <div
          className="flex items-center justify-between gap-2 border-b border-[#E50914]/30 bg-[#E50914]/10 px-4 py-1.5"
          data-testid="sing-activity-bar"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#ff6b6b]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#E50914]" />
            {t('singLive')}
          </span>
          <button
            onClick={onEndActivity}
            data-testid="sing-end"
            className="rounded-full border border-[#E50914]/50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#ff6b6b] transition hover:bg-[#E50914] hover:text-white"
          >
            {t('end')}
          </button>
        </div>
      )}

      {/* Listen Together / Watch Party activity bar — chat stays open below */}
      {mediaMode && (
        <div
          className={`flex items-center justify-between gap-2 border-b px-4 py-1.5 ${
            activity === 'listen'
              ? 'border-green-500/30 bg-green-500/10'
              : 'border-[#F5A623]/30 bg-[#F5A623]/10'
          }`}
          data-testid={`${activity}-activity-bar`}
        >
          <span
            className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest ${
              activity === 'listen' ? 'text-green-400' : 'text-[#F5A623]'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 animate-pulse rounded-full ${
                activity === 'listen' ? 'bg-green-500' : 'bg-[#F5A623]'
              }`}
            />
            {activity === 'listen' ? t('listenLive') : t('watchLive')}
          </span>
          <button
            onClick={onEndActivity}
            data-testid="activity-end"
            className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest transition ${
              activity === 'listen'
                ? 'border-green-500/50 text-green-400 hover:bg-green-500 hover:text-white'
                : 'border-[#F5A623]/50 text-[#F5A623] hover:bg-[#F5A623] hover:text-black'
            }`}
          >
            {t('end')}
          </button>
        </div>
      )}

      {/* SING MODE — stage layout (video grid + side panels) */}
      {singMode ? (
      <div className="relative flex min-h-0 flex-1">
        {/* video grid */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div
            className={`mx-auto grid gap-3 ${
              participants.length <= 1
                ? 'max-w-md grid-cols-1'
                : 'max-w-4xl grid-cols-1 sm:grid-cols-2'
            }`}
            data-testid="video-grid"
          >
            {participants.map((p) =>
              p.id === myId ? (
                <VideoTile
                  key={p.id}
                  participant={p}
                  stream={streamFor(p.id, true)}
                  isLocal
                  micOn={micOn}
                  camOn={dataSaver ? false : camOn}
                  isMe
                  onStage={stage?.singerId === p.id}
                />
              ) : (
                <VideoTile
                  key={p.id}
                  participant={p}
                  stream={streamFor(p.id, false)}
                  isLocal={false}
                  micOn={p.micOn}
                  camOn={p.camOn}
                  onStage={stage?.singerId === p.id}
                />
              ),
            )}
          </div>
          {participants.length === 1 && (
            <div className="mx-auto mt-4 max-w-md text-center">
              <p className="text-xs leading-relaxed text-neutral-500">
                You&apos;re the first one here! Room code{' '}
                <span className="font-black text-[#E50914]">
                  {room.id.replace('state:', '').toUpperCase()}
                </span>{' '}
                — one tap below sends your friends a WhatsApp invite that drops
                them straight into this room.
              </p>
              <ShareInviteButton
                roomId={room.id}
                roomName={room.name}
                stateName={room.state}
                variant="full"
                testId="room-share-solo"
              />
            </div>
          )}
        </div>

        {aside}
      </div>
      ) : (
      /* ----------------- HANGOUT MODE — chat is the main surface -------------
         (also the base layout for Listen Together / Watch Party, with the
         media panel sliding over from the right) */
      <div className="relative flex min-h-0 flex-1 flex-col" data-testid="hangout-area">
        {/* who&apos;s here — compact cam strip along the top */}
        <div
          className="flex gap-2 overflow-x-auto border-b border-neutral-800/70 p-2"
          data-testid="cam-strip"
        >
          {participants.map((p) =>
            p.id === myId ? (
              <div key={p.id} className="w-36 shrink-0 sm:w-44">
                <VideoTile
                  participant={p}
                  stream={streamFor(p.id, true)}
                  isLocal
                  micOn={micOn}
                  camOn={dataSaver ? false : camOn}
                  isMe
                />
              </div>
            ) : (
              <div key={p.id} className="w-36 shrink-0 sm:w-44">
                <VideoTile
                  participant={p}
                  stream={streamFor(p.id, false)}
                  isLocal={false}
                  micOn={p.micOn}
                  camOn={p.camOn}
                />
              </div>
            ),
          )}
        </div>

        {participants.length === 1 && (
          <div className="mx-auto w-full max-w-md px-4 pt-3 text-center">
            <p className="text-xs leading-relaxed text-neutral-500">
              You&apos;re the first one here! Room code{' '}
              <span className="font-black text-[#E50914]">
                {room.id.replace('state:', '').toUpperCase()}
              </span>{' '}
              — one tap below sends your friends a WhatsApp invite that drops
              them straight into this room.
            </p>
            <ShareInviteButton
              roomId={room.id}
              roomName={room.name}
              stateName={room.state}
              variant="full"
              testId="room-share-solo"
            />
          </div>
        )}

        {/* the heart of the hangout */}
        <div className="min-h-0 flex-1" data-testid="hangout-chat">
          <ChatPanel
            messages={chat}
            myId={myId}
            onSend={onSendChat}
            blockedNames={blocked}
            onBlock={blockUser}
            onHeart={onSendReaction}
          />
        </div>

        {(mediaMode || panel === 'games') && aside}
      </div>
      )}

      {/* controls */}
      <RoomControls
        mode={singMode ? 'sing' : mediaMode ? 'media' : 'hangout'}
        micOn={micOn}
        camOn={camOn}
        hasCam={hasCam}
        chatOpen={effectivePanel === 'chat'}
        stageOpen={effectivePanel === 'stage'}
        karaokeOpen={effectivePanel === 'karaoke'}
        gamesOpen={panel === 'games'}
        connecting={false}
        onStartSingAlong={onStartSingAlong}
        onListenTogether={onListenTogether}
        onWatchParty={onWatchParty}
        onOpenGames={() => setPanel((p) => (p === 'games' ? null : 'games'))}
        onToggleMic={onToggleMic}
        onToggleCam={onToggleCam}
        onToggleChat={() => {
          setSeenCount(room.chat.length)
          setPanel((p) => (effectivePanel === 'chat' ? null : 'chat'))
        }}
        onToggleStage={() => setPanel((p) => (effectivePanel === 'stage' ? null : 'stage'))}
        onToggleKaraoke={() => setPanel((p) => (effectivePanel === 'karaoke' ? null : 'karaoke'))}
        onLeave={() => setConfirmLeave(true)}
      />

      {/* leave confirmation — leaving frees your seat, so make it deliberate */}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent
          className="border-neutral-800 bg-[#141414] text-white"
          data-testid="leave-confirm"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Leave the room?</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              You&apos;ll return to the lobby and the Main Seat will free up if you’re
              on it. Your points are already saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white"
              data-testid="leave-cancel"
            >
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#E50914] text-white hover:bg-[#F6121D]"
              data-testid="leave-confirm-action"
              onClick={onLeave}
            >
              Yes, leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* People & safety — participants, host controls, Data Saver, report */}
      <PeoplePanel
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        room={room}
        myId={myId}
        blocked={blocked}
        dataSaver={dataSaver}
        onToggleDataSaver={toggleDataSaver}
        onHostMute={onHostMute}
        onHostRemove={onHostRemove}
        onUnblock={unblockUser}
        onReport={() => {
          setPeopleOpen(false)
          setReportOpen(true)
        }}
      />

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        room={room}
        myId={myId}
        onSubmit={(reason, targetName) => {
          onReport(reason, targetName)
          setReportOpen(false)
        }}
      />

      {/* quick-award popper / heart — always at hand while someone else sings */}
      {singMode && stage && !iAmOnSeat && (
        <QuickAwardButtons onAward={onAward} offsetWithMiniPlayer={showMiniPlayer} />
      )}

      {/* floating hearts — tap ❤️ beside the chat input, everyone sees them */}

      {/* mini now-playing bar (media keeps playing while the panel is closed) */}
      {panelAvailable && showMiniPlayer && karaoke && (
        <div
          className="fixed inset-x-3 bottom-[76px] z-30 flex items-center gap-2 rounded-lg border border-neutral-800 bg-black/90 px-3 py-2 shadow-lg shadow-black/60 backdrop-blur sm:inset-x-auto sm:right-[calc(max(1rem,50%-24rem)+1rem)] sm:w-80"
          data-testid="mini-player"
        >
          <button
            onClick={toggleMiniPlayback}
            aria-label={karaoke.playing ? 'Pause for everyone' : 'Play for everyone'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E50914] text-white transition hover:bg-[#F6121D]"
            data-testid="mini-player-toggle"
          >
            {karaoke.playing ? <Pause className="h-3.5 w-3.5 fill-white" /> : <Play className="h-3.5 w-3.5 fill-white" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold text-white">{karaoke.title || 'Now playing'}</p>
            <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-neutral-500">
              <span className={`h-1 w-1 rounded-full ${karaoke.playing ? 'animate-pulse bg-[#E50914]' : 'bg-neutral-600'}`} />
              {karaoke.playing ? 'playing for everyone' : 'paused'}
            </p>
          </div>
          <button
            onClick={() => setPanel('karaoke')}
            className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-neutral-300 transition hover:border-[#E50914] hover:text-white"
          >
            Open
          </button>
        </div>
      )}

      {/* unread chat badge (hidden in plain hangouts — chat is always visible there) */}
      {panelAvailable && !panelOpen && unread > 0 && (
        <button
          onClick={() => {
            setSeenCount(room.chat.length)
            setPanel('chat')
          }}
          className={`fixed right-4 z-40 rounded-full bg-[#E50914] px-3 py-1.5 text-xs font-black text-white shadow-lg shadow-black/50 hover:bg-[#F6121D] ${
            showMiniPlayer ? 'bottom-32' : 'bottom-20'
          } sm:right-5`}
          aria-label={`${unread} new messages — open chat`}
        >
          💬 {unread} new
        </button>
      )}

      {/* animated applause bursts (popper "10 10 10" showers & +100 hearts) */}
      <ApplauseBursts events={applause} onDone={onClearApplause} />

      {/* floating hearts — tap ❤️ anywhere, everyone sees them rise */}
      <FloatingHearts reactions={reactions} onDone={onClearReaction} />
    </div>
  )
}
