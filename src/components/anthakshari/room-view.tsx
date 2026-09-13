'use client'

import { useMemo, useState } from 'react'
import { ChevronsLeft, ChevronsRight, Pause, Play, Users, Wifi, WifiOff, X } from 'lucide-react'
import { VideoTile } from './video-tile'
import { RoomControls } from './room-controls'
import { StagePanel, QuickAwardButtons } from './stage-panel'
import { ChatPanel } from './chat-panel'
import { KaraokePanel } from './karaoke-panel'
import { ApplauseBursts } from './applause-bursts'
import { RoomSnapshot, ChatMessage, KaraokeState, ApplauseEvent, ApplauseKind } from '@/hooks/use-room'

export type SidePanel = 'stage' | 'chat' | 'karaoke' | null

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
  onToggleMic: () => void
  onToggleCam: () => void
  onSendChat: (text: string) => void
  onTakeSeat: () => void
  onLeaveSeat: () => void
  onAward: (kind: ApplauseKind) => void
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
  onToggleMic,
  onToggleCam,
  onSendChat,
  onTakeSeat,
  onLeaveSeat,
  onAward,
  onLeave,
  onKaraokeLoad,
  onKaraokePlay,
  onKaraokePause,
  onKaraokeSeek,
  onKaraokeEnded,
  onKaraokeQueueAdd,
  onKaraokeQueueRemove,
}: RoomViewProps) {
  const [panel, setPanel] = useState<SidePanel>('stage')
  const [seenCount, setSeenCount] = useState(0)

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
  const panelOpen = panel !== null

  // unread badge: derived — seenCount is refreshed in the toggle handler (event)
  const unread = Math.max(0, room.chat.length - seenCount)

  const chat: ChatMessage[] = useMemo(() => room.chat.slice(-60), [room.chat])

  const participants = room.participants

  // mini now-playing bar shows whenever a track exists and the karaoke panel is closed
  const showMiniPlayer = !!karaoke?.videoId && panel !== 'karaoke'
  const toggleMiniPlayback = () => {
    if (!karaoke?.videoId) return
    if (karaoke.playing) onKaraokePause(karaoke.positionAt)
    else onKaraokePlay(karaoke.positionAt)
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-[#141414] text-white">
      {/* top bar */}
      <header className="flex items-center gap-3 border-b border-neutral-800 bg-black/40 px-4 py-2.5">
        <span className="text-lg font-black tracking-tighter text-[#E50914] sm:text-xl">
          SING&nbsp;ALONG
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-white sm:text-sm" data-testid="room-title">
            {room.name}
          </p>
          <p className="truncate text-[10px] uppercase tracking-widest text-neutral-500">
            {room.state} · room code {room.id.replace('state:', '').toUpperCase()}
            {stage && <span className="ml-1.5 text-[#E50914]">· 🎤 {stage.singerName} on the Main Seat</span>}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-neutral-800/80 px-2.5 py-1 text-[11px] font-bold text-neutral-300">
          <Users className="h-3.5 w-3.5" />
          {participants.length}/8
        </span>
        <span aria-label={connected ? 'connected' : 'disconnected'}>
          {connected ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-[#E50914]" />
          )}
        </span>
      </header>

      {/* main area: video grid + sliding panel */}
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
                  stream={localStream ?? undefined}
                  isLocal
                  micOn={micOn}
                  camOn={camOn}
                  isMe
                  onStage={stage?.singerId === p.id}
                />
              ) : (
                <VideoTile
                  key={p.id}
                  participant={p}
                  stream={remoteStreams[p.id]}
                  isLocal={false}
                  micOn={p.micOn}
                  camOn={p.camOn}
                  onStage={stage?.singerId === p.id}
                />
              ),
            )}
          </div>
          {participants.length === 1 && (
            <p className="mx-auto mt-4 max-w-md text-center text-xs leading-relaxed text-neutral-500">
              You&apos;re the first one here! Share the room code{' '}
              <span className="font-black text-[#E50914]">
                {room.id.replace('state:', '').toUpperCase()}
              </span>{' '}
              with singers in {room.state} — or wait for someone to join.
            </p>
          )}
        </div>

        {/* sliding side panel (stage / chat / karaoke) — shrinkable / expandable */}
        <aside
          className={`absolute inset-y-0 right-0 z-20 flex w-full ${panelWidthClass} transform flex-col border-l border-neutral-800 bg-[#141414] transition-all duration-300 ease-out ${
            panelOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
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
          <div className={panel === 'karaoke' ? 'flex h-full min-h-0 flex-col' : 'hidden'}>
            <KaraokePanel
              karaoke={karaoke}
              myId={myId}
              panelVisible={panel === 'karaoke'}
              onLoad={onKaraokeLoad}
              onPlay={onKaraokePlay}
              onPause={onKaraokePause}
              onSeek={onKaraokeSeek}
              onEnded={onKaraokeEnded}
              onQueueAdd={onKaraokeQueueAdd}
              onQueueRemove={onKaraokeQueueRemove}
            />
          </div>
          {panel === 'chat' && (
            <ChatPanel messages={chat} myId={myId} onSend={onSendChat} />
          )}
          {panel === 'stage' && (
            <StagePanel
              stage={stage}
              participants={participants}
              myId={myId}
              onTakeSeat={onTakeSeat}
              onLeaveSeat={onLeaveSeat}
              onAward={onAward}
            />
          )}
        </aside>
      </div>

      {/* controls */}
      <RoomControls
        micOn={micOn}
        camOn={camOn}
        hasCam={hasCam}
        chatOpen={panel === 'chat'}
        stageOpen={panel === 'stage'}
        karaokeOpen={panel === 'karaoke'}
        connecting={false}
        onToggleMic={onToggleMic}
        onToggleCam={onToggleCam}
        onToggleChat={() => {
          setSeenCount(room.chat.length)
          setPanel((p) => (p === 'chat' ? null : 'chat'))
        }}
        onToggleStage={() => setPanel((p) => (p === 'stage' ? null : 'stage'))}
        onToggleKaraoke={() => setPanel((p) => (p === 'karaoke' ? null : 'karaoke'))}
        onLeave={onLeave}
      />

      {/* quick-award popper / heart — always at hand while someone else sings */}
      {stage && !iAmOnSeat && (
        <QuickAwardButtons onAward={onAward} offsetWithMiniPlayer={showMiniPlayer} />
      )}

      {/* mini now-playing bar (karaoke keeps playing while the panel is closed) */}
      {showMiniPlayer && karaoke && (
        <div
          className="fixed inset-x-3 bottom-[76px] z-30 flex items-center gap-2 rounded-lg border border-neutral-800 bg-black/90 px-3 py-2 shadow-lg shadow-black/60 backdrop-blur sm:inset-x-auto sm:right-[calc(max(1rem,50%-24rem)+1rem)] sm:w-80"
          data-testid="mini-player"
        >
          <button
            onClick={toggleMiniPlayback}
            aria-label={karaoke.playing ? 'Pause karaoke for everyone' : 'Play karaoke for everyone'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E50914] text-white transition hover:bg-[#F6121D]"
            data-testid="mini-player-toggle"
          >
            {karaoke.playing ? <Pause className="h-3.5 w-3.5 fill-white" /> : <Play className="h-3.5 w-3.5 fill-white" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold text-white">{karaoke.title || 'Karaoke track'}</p>
            <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-neutral-500">
              <span className={`h-1 w-1 rounded-full ${karaoke.playing ? 'animate-pulse bg-[#E50914]' : 'bg-neutral-600'}`} />
              {karaoke.playing ? 'playing on stage' : 'paused'}
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

      {/* unread chat badge */}
      {!panelOpen && unread > 0 && (
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
    </div>
  )
}
