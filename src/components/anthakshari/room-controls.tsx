'use client'

import { Mic, MicOff, Video, VideoOff, MessageSquare, Music4, Youtube, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RoomControlsProps {
  micOn: boolean
  camOn: boolean
  hasCam: boolean
  chatOpen: boolean
  stageOpen: boolean
  karaokeOpen: boolean
  connecting: boolean
  onToggleMic: () => void
  onToggleCam: () => void
  onToggleChat: () => void
  onToggleStage: () => void
  onToggleKaraoke: () => void
  onLeave: () => void
}

export function RoomControls({
  micOn,
  camOn,
  hasCam,
  chatOpen,
  stageOpen,
  karaokeOpen,
  connecting,
  onToggleMic,
  onToggleCam,
  onToggleChat,
  onToggleStage,
  onToggleKaraoke,
  onLeave,
}: RoomControlsProps) {
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
