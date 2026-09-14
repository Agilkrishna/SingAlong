'use client'

import { useEffect, useRef, useState } from 'react'
import { MicOff, VideoOff, Crown, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Participant } from '@/hooks/use-room'

interface VideoTileProps {
  participant: Participant
  stream?: MediaStream
  isLocal: boolean
  micOn: boolean
  camOn: boolean
  onStage?: boolean
  isMe?: boolean
}

export function VideoTile({
  participant,
  stream,
  isLocal,
  micOn,
  camOn,
  onStage,
  isMe,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true) // remote tiles start muted (autoplay policy)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (stream) {
      if (el.srcObject !== stream) el.srcObject = stream
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }, [stream])

  const showVideo = stream && (isLocal ? camOn : participant.camOn) && playing

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-lg border-2 transition-all duration-300 ${
        onStage
          ? 'border-[#E50914] shadow-[0_0_24px_rgba(229,9,20,0.55)] scale-[1.01]'
          : 'border-neutral-800'
      } bg-neutral-900`}
      data-testid={isLocal ? 'video-tile-local' : `video-tile-${participant.id}`}
    >
      {/* video element (kept mounted for stable srcObject) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal ? true : muted}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          showVideo ? 'opacity-100' : 'opacity-0'
        } ${isLocal ? 'scale-x-[-1]' : ''}`}
      />

      {/* avatar fallback */}
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-neutral-900 to-black">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-black text-white shadow-lg sm:h-16 sm:w-16 sm:text-2xl"
            style={{ backgroundColor: participant.color }}
          >
            {participant.avatar ?? participant.name.slice(0, 2).toUpperCase()}
          </div>
          {(isLocal ? !camOn : !participant.camOn) && (
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-neutral-500">
              <VideoOff className="h-3 w-3" /> camera off
            </span>
          )}
        </div>
      )}

      {/* top-right: remote mute control */}
      {!isLocal && stream && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? `Unmute ${participant.name}` : `Mute ${participant.name}`}
          className="absolute right-2 top-2 z-10 h-8 w-8 rounded-full bg-black/60 text-white opacity-80 hover:bg-black/80 hover:opacity-100"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      )}

      {/* mic status */}
      <div className="absolute left-2 top-2 z-10 rounded-full bg-black/60 p-1.5 backdrop-blur-sm">
        {micOn ? (
          <span className="block h-2 w-2 rounded-full bg-green-500" aria-label="mic on" />
        ) : (
          <MicOff className="h-3.5 w-3.5 text-[#E50914]" aria-label="mic muted" />
        )}
      </div>

      {/* bottom name bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2.5 pb-2 pt-6">
        <span className="truncate text-xs font-semibold text-white sm:text-sm">
          {participant.name}
          {isMe && <span className="ml-1 text-[10px] font-normal text-neutral-400">(you)</span>}
        </span>
        {participant.isHost && <Crown className="h-3.5 w-3.5 shrink-0 text-[#F5A623]" />}
      </div>

      {/* on-stage indicator */}
      {onStage && (
        <div className="absolute inset-x-0 top-0 flex justify-center bg-gradient-to-b from-[#E50914]/80 to-transparent px-2 pb-2 pt-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
            🎤 Main Seat
          </span>
        </div>
      )}
    </div>
  )
}
