'use client'

import { Gamepad2, Headphones, Mic, MicOff, MonitorPlay, Video, VideoOff, MessageSquare, Music4, Youtube, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RoomControlsProps {
  /** 'hangout' = chat-first (mic · cam · listen · watch · 🎤 Sing Along · leave)
   *  'sing'    = Sing Along running (mic · cam · stage · karaoke · chat · leave)
   *  'media'   = Listen Together / Watch Party running (mic · cam · karaoke · chat · leave) */
  mode: 'hangout' | 'sing' | 'media'
  micOn: boolean
  camOn: boolean
  hasCam: boolean
  chatOpen: boolean
  stageOpen: boolean
  karaokeOpen: boolean
  /** party games panel open (hangout mode) */
  gamesOpen?: boolean
  connecting: boolean
  onToggleMic: () => void
  onToggleCam: () => void
  onToggleChat: () => void
  onToggleStage: () => void
  onToggleKaraoke: () => void
  onStartSingAlong: () => void
  onListenTogether: () => void
  onWatchParty: () => void
  onOpenGames?: () => void
  onLeave: () => void
}

export function RoomControls({
  mode,
  micOn,
  camOn,
  hasCam,
  chatOpen,
  stageOpen,
  karaokeOpen,
  gamesOpen,
  connecting,
  onToggleMic,
  onToggleCam,
  onToggleChat,
  onToggleStage,
  onToggleKaraoke,
  onStartSingAlong,
  onListenTogether,
  onWatchParty,
  onOpenGames,
  onLeave,
}: RoomControlsProps) {
  if (mode === 'hangout') {
    return (
      <div className="flex items-center justify-center gap-1.5 border-t border-neutral-800 bg-[#141414] px-2 py-3 sm:gap-2 sm:px-3">
        <Button
          size="icon"
          onClick={onToggleMic}
          aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
          className={`h-12 w-12 shrink-0 rounded-full transition-all sm:h-11 sm:w-11 ${
            micOn
              ? 'bg-neutral-800 text-white hover:bg-neutral-700'
              : 'bg-[#E50914] text-white hover:bg-[#F6121D]'
          }`}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>

        <Button
          size="icon"
          onClick={onToggleCam}
          disabled={!hasCam}
          aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
          className={`h-12 w-12 shrink-0 rounded-full transition-all disabled:opacity-40 sm:h-11 sm:w-11 ${
            camOn
              ? 'bg-neutral-800 text-white hover:bg-neutral-700'
              : 'bg-[#E50914] text-white hover:bg-[#F6121D]'
          }`}
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>

        {/* shared-media launchers — music & videos everyone hears/sees in sync */}
        <Button
          size="icon"
          variant="outline"
          onClick={onListenTogether}
          aria-label="Start Listen Together"
          title="Listen Together — synced music for the room"
          data-testid="listen-start"
          className="h-12 w-12 shrink-0 rounded-full border-neutral-700 bg-neutral-800/60 text-neutral-300 transition hover:border-green-500 hover:text-green-400 sm:h-11 sm:w-11"
        >
          <Headphones className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={onWatchParty}
          aria-label="Start a Watch Party"
          title="Watch Party — synced video for the room"
          data-testid="watch-start"
          className="h-12 w-12 shrink-0 rounded-full border-neutral-700 bg-neutral-800/60 text-neutral-300 transition hover:border-[#F5A623] hover:text-[#F5A623] sm:h-11 sm:w-11"
        >
          <MonitorPlay className="h-5 w-5" />
        </Button>

        {/* party games — quiz, truth-or-dare, rapid-fire in the side panel */}
        {onOpenGames && (
          <Button
            size="icon"
            variant="outline"
            onClick={onOpenGames}
            aria-label="Open party games"
            aria-pressed={gamesOpen}
            title="Party games — quiz · truth or dare · rapid-fire"
            data-testid="games-open"
            className={`h-12 w-12 shrink-0 rounded-full border-neutral-700 transition sm:h-11 sm:w-11 ${
              gamesOpen
                ? 'border-[#E50914] bg-[#E50914]/20 text-[#E50914]'
                : 'bg-neutral-800/60 text-neutral-300 hover:border-[#E50914]/60 hover:text-white'
            }`}
          >
            <Gamepad2 className="h-5 w-5" />
          </Button>
        )}

        {/* the one-tap activity launcher — flips the whole room into Sing Along */}
        <button
          onClick={onStartSingAlong}
          data-testid="sing-start"
          aria-label="Start Sing Along"
          className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[#E50914] px-3 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-[#E50914]/30 transition hover:bg-[#F6121D] sm:h-11 sm:max-w-[11rem] sm:text-xs"
        >
          <Mic className="h-4 w-4 shrink-0" />
          <span className="truncate">Sing Along</span>
        </button>

        <Button
          size="icon"
          onClick={onLeave}
          aria-label="Leave room"
          data-testid="leave-room"
          className="h-12 w-12 shrink-0 rounded-full bg-white text-black hover:bg-neutral-200 sm:h-11 sm:w-11"
        >
          {connecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center gap-2 border-t border-neutral-800 bg-[#141414] px-3 py-3 sm:gap-3">
      <Button
        size="icon"
        onClick={onToggleMic}
        aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        className={`h-12 w-12 rounded-full transition-all sm:h-11 sm:w-11 ${
          micOn
            ? 'bg-neutral-800 text-white hover:bg-neutral-700'
            : 'bg-[#E50914] text-white hover:bg-[#F6121D]'
        }`}
      >
        {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </Button>

      <Button
        size="icon"
        onClick={onToggleCam}
        disabled={!hasCam}
        aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
        className={`h-12 w-12 rounded-full transition-all disabled:opacity-40 sm:h-11 sm:w-11 ${
          camOn
            ? 'bg-neutral-800 text-white hover:bg-neutral-700'
            : 'bg-[#E50914] text-white hover:bg-[#F6121D]'
        }`}
      >
        {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </Button>

      {mode === 'sing' ? (
        <Button
          size="icon"
          variant="outline"
          onClick={onToggleStage}
          aria-label="Toggle Main Seat panel"
          aria-pressed={stageOpen}
          className={`h-12 w-12 rounded-full border-neutral-700 sm:h-11 sm:w-11 ${
            stageOpen ? 'border-[#E50914] bg-[#E50914]/20 text-[#E50914]' : 'bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          <Mic className="h-5 w-5" />
        </Button>
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 sm:h-11 sm:w-11" title={mode === 'media' ? 'Shared media live' : ''}>
          {mode === 'media' ? <Headphones className="h-5 w-5 text-green-400" /> : <Music4 className="h-5 w-5 text-green-400" />}
        </span>
      )}

      <Button
        size="icon"
        variant="outline"
        onClick={onToggleKaraoke}
        aria-label="Toggle karaoke player"
        aria-pressed={karaokeOpen}
        className={`h-12 w-12 rounded-full border-neutral-700 sm:h-11 sm:w-11 ${
          karaokeOpen ? 'border-[#E50914] bg-[#E50914]/20 text-[#E50914]' : 'bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700'
        }`}
      >
        <Youtube className="h-5 w-5" />
      </Button>

      <Button
        size="icon"
        variant="outline"
        onClick={onToggleChat}
        aria-label="Toggle chat"
        aria-pressed={chatOpen}
        className={`h-12 w-12 rounded-full border-neutral-700 sm:h-11 sm:w-11 ${
          chatOpen ? 'border-[#E50914] bg-[#E50914]/20 text-[#E50914]' : 'bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700'
        }`}
      >
        <MessageSquare className="h-5 w-5" />
      </Button>

      <Button
        size="icon"
        onClick={onLeave}
        aria-label="Leave room"
        data-testid="leave-room"
        className="h-12 w-12 rounded-full bg-white text-black hover:bg-neutral-200 sm:h-11 sm:w-11"
      >
        {connecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
      </Button>
    </div>
  )
}
