'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ListMusic, Pause, Play, Search, Volume2, VolumeX, X, Youtube } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { KaraokeState } from '@/hooks/use-room'

/**
 * KaraokePanel — a shared, room-wide YouTube karaoke player.
 *
 * • The video itself is embedded with the official YouTube IFrame API.
 * • Anyone can search (in the dedicated /karaoke-search <iframe>), play,
 *   pause, seek or queue songs — the realtime service syncs everybody.
 * • "Media" mute/volume is a local listening preference (like Netflix).
 */

type YTPlayer = {
  loadVideoById: (o: { videoId: string; startSeconds?: number }) => void
  cueVideoById: (o: { videoId: string; startSeconds?: number }) => void
  seekTo: (s: number, allowSeekAhead: boolean) => void
  playVideo: () => void
  pauseVideo: () => void
  mute: () => void
  unMute: () => void
  isMuted: () => boolean
  setVolume: (v: number) => void
  getCurrentTime: () => number
  getPlayerState: () => number
  getVideoData: () => { video_id?: string; title?: string }
  destroy: () => void
}

interface KaraokePanelProps {
  karaoke: KaraokeState | null
  myId: string
  /** true while the karaoke tab is the open side-panel tab — the portal
   *  "tap to listen" banner is only shown when this panel can't be seen */
  panelVisible: boolean
  onLoad: (videoId: string, title: string) => void
  onPlay: (position: number) => void
  onPause: (position: number) => void
  onSeek: (position: number) => void
  onEnded: () => void
  onQueueAdd: (videoId: string, title: string) => void
  onQueueRemove: (index: number) => void
}

export function KaraokePanel({
  karaoke,
  myId,
  panelVisible,
  onLoad,
  onPlay,
  onPause,
  onEnded,
  onQueueAdd,
  onQueueRemove,
}: KaraokePanelProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const applyingUntilRef = useRef(0) // ignore state-echo while syncing remotely
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateHandlerRef = useRef<(s: number) => void>(() => {})

  const [apiReady, setApiReady] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mediaMuted, setMediaMuted] = useState(false)
  const [volume, setVolume] = useState(80)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [playerError, setPlayerError] = useState<{ text: string; videoId: string } | null>(null)

  /* --------------------- load the YouTube IFrame API ---------------------- */
  useEffect(() => {
    let cancelled = false
    const ensureApi = () =>
      new Promise<void>((resolve) => {
        const w = window as unknown as {
          YT?: { Player?: unknown; PlayerState?: Record<string, number> }
          onYouTubeIframeAPIReady?: () => void
        }
        if (w.YT?.Player) return resolve()
        if (!document.querySelector('script[data-yt-api="1"]')) {
          const tag = document.createElement('script')
          tag.src = 'https://www.youtube.com/iframe_api'
          tag.dataset.ytApi = '1'
          const prev = w.onYouTubeIframeAPIReady
          w.onYouTubeIframeAPIReady = () => {
            prev?.()
            resolve()
          }
          document.head.appendChild(tag)
        } else {
          // script already requested by another mount — poll until ready
          const t = setInterval(() => {
            if (w.YT?.Player) {
              clearInterval(t)
              resolve()
            }
          }, 120)
          return
        }
      })
    void ensureApi().then(() => {
      if (!cancelled) setApiReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /* -------------------------- create the player --------------------------- */
  useEffect(() => {
    if (!apiReady || playerRef.current || !wrapperRef.current) return

    // capture the wrapper element — React 19 nulls refs before running
    // effect cleanups on unmount, so the closure must hold the node itself
    const wrapper = wrapperRef.current
    const host = document.createElement('div')
    host.className = 'h-full w-full'
    wrapper.innerHTML = ''
    wrapper.appendChild(host)

    const w = window as unknown as {
      YT: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: Record<string, number> }
    }

    const player = new w.YT.Player(host, {
      width: '100%',
      height: '100%',
      playerVars: {
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => setPlayerReady(true),
        onStateChange: (e: { data: number }) => stateHandlerRef.current(e.data),
        onError: () =>
          setPlayerError({
            text: 'This track can’t be played here (owner restricted it).',
            videoId: playerRef.current?.getVideoData?.()?.video_id ?? '',
          }),
      },
    })
    playerRef.current = player

    return () => {
      if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current)
      try {
        player.destroy()
      } catch {}
      playerRef.current = null
      wrapper.innerHTML = ''
      setPlayerReady(false)
    }
  }, [apiReady])

  /* --------------- broadcast local user-driven player events -------------- */
  const handlePlayerState = useCallback(
    (state: number) => {
      const w = window as unknown as { YT?: { PlayerState?: Record<string, number> } }
      const ST = w.YT?.PlayerState
      const player = playerRef.current
      if (!ST || !player) return
      if (Date.now() < applyingUntilRef.current) return // echo of a remote sync
      if (state === ST.PLAYING) {
        setNeedsGesture(false)
        onPlay(player.getCurrentTime())
      } else if (state === ST.PAUSED) {
        onPause(player.getCurrentTime())
      } else if (state === ST.ENDED) {
        onEnded()
      }
    },
    [onPlay, onPause, onEnded],
  )

  // keep the live handler reachable from the (once-created) YT player instance
  useEffect(() => {
    stateHandlerRef.current = handlePlayerState
  }, [handlePlayerState])

  /* --------------- reconcile with the shared room karaoke state ----------- */

  // render-adjust: a fresh track resets the autoplay-gesture overlay & error
  const [prevVideoId, setPrevVideoId] = useState<string | undefined>(karaoke?.videoId)
  if (prevVideoId !== karaoke?.videoId) {
    setPrevVideoId(karaoke?.videoId)
    setNeedsGesture(false)
  }

  useEffect(() => {
    const player = playerRef.current
    const w = window as unknown as { YT?: { PlayerState?: Record<string, number> } }
    const ST = w.YT?.PlayerState
    if (!player || !playerReady || !ST || !karaoke?.videoId) return

    applyingUntilRef.current = Date.now() + 1400

    const drift = karaoke.playing
      ? Math.max(0, (Date.now() - (karaoke.serverNow ?? karaoke.updatedAt)) / 1000)
      : 0
    const target = Math.max(0, karaoke.positionAt + drift)

    try {
      const currentId = player.getVideoData?.()?.video_id
      if (currentId !== karaoke.videoId) {
        if (karaoke.playing) player.loadVideoById({ videoId: karaoke.videoId, startSeconds: target })
        else player.cueVideoById({ videoId: karaoke.videoId, startSeconds: target })
      } else if (karaoke.playing) {
        const st = player.getPlayerState?.()
        if (Math.abs(player.getCurrentTime() - target) > 2.5) player.seekTo(target, true)
        if (st !== ST.PLAYING) {
          player.playVideo()
          if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current)
          gestureTimerRef.current = setTimeout(() => {
            try {
              if (playerRef.current?.getPlayerState?.() !== ST.PLAYING) setNeedsGesture(true)
            } catch {}
          }, 2000)
        }
      } else {
        const st = player.getPlayerState?.()
        if (st === ST.PLAYING || st === ST.BUFFERING) player.pauseVideo()
        if (Math.abs(player.getCurrentTime() - target) > 2.5) player.seekTo(target, true)
      }
    } catch {
      /* player mid-rebuild — next event will re-sync */
    }
  }, [playerReady, karaoke?.videoId, karaoke?.playing, karaoke?.updatedAt, karaoke?.positionAt, karaoke?.serverNow])

  /* ------------------ local media mute / volume (Netflix) ----------------- */
  useEffect(() => {
    try {
      playerRef.current?.setVolume(volume)
    } catch {}
  }, [volume, playerReady])

  const toggleMediaMute = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    const next = !mediaMuted
    try {
      if (next) player.mute()
      else player.unMute()
    } catch {}
    setMediaMuted(next)
  }, [mediaMuted])

  /* --------- one-tap local playback join (autoplay-block recovery) -------- */
  // The room is already playing — this only starts THIS device's speaker, so
  // the echo-guard is armed and nothing is broadcast (no position jitter).
  const joinLocally = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    applyingUntilRef.current = Date.now() + 1400
    setNeedsGesture(false)
    try {
      if (mediaMuted) {
        player.unMute()
        setMediaMuted(false)
      }
      player.playVideo()
    } catch {}
  }, [mediaMuted])

  // Browsers only need ONE user gesture — so while autoplay is blocked, a tap
  // anywhere in the app (opening a panel, sending a chat…) joins playback too.
  useEffect(() => {
    if (!needsGesture) return
    const onAnyTap = () => joinLocally()
    document.addEventListener('pointerdown', onAnyTap, true)
    return () => document.removeEventListener('pointerdown', onAnyTap, true)
  }, [needsGesture, joinLocally])

  /* ------- messages from the /karaoke-search iframe (separate window) ----- */
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; videoId?: unknown; title?: unknown } | null
      if (!d || typeof d !== 'object') return
      const videoId = typeof d.videoId === 'string' ? d.videoId : ''
      if (!videoId) return
      const title = typeof d.title === 'string' ? d.title : ''
      if (d.type === 'karaoke-select') {
        onLoad(videoId, title)
        setSearchOpen(false)
      } else if (d.type === 'karaoke-queue') {
        onQueueAdd(videoId, title)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onLoad, onQueueAdd])

  const hasTrack = !!karaoke?.videoId
  const isPlaying = !!karaoke?.playing
  const controllerIsMe = karaoke?.by === myId
  const shownError = playerError && playerError.videoId === karaoke?.videoId ? playerError.text : ''

  const togglePlay = () => {
    const player = playerRef.current
    if (!player || !hasTrack) return
    applyingUntilRef.current = Date.now() + 1400
    if (isPlaying) {
      player.pauseVideo()
      onPause(player.getCurrentTime())
    } else {
      setNeedsGesture(false)
      player.playVideo()
      onPlay(player.getCurrentTime())
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid="karaoke-panel">
      {/* header */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Youtube className="h-5 w-5 text-[#FF0000]" />
          <h3 className="text-sm font-black uppercase tracking-wide text-white">Karaoke</h3>
          {hasTrack && (
            <span className="flex items-center gap-1 rounded-full bg-[#E50914]/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#E50914]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#E50914]" />
              {isPlaying ? 'Live' : 'Paused'}
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setSearchOpen((v) => !v)}
          className={`h-8 rounded-md px-3 text-[11px] font-black uppercase tracking-wide ${
            searchOpen ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'bg-[#E50914] hover:bg-[#F6121D]'
          }`}
          data-testid="toggle-yt-search"
        >
          <Search className="mr-1 h-3.5 w-3.5" />
          {searchOpen ? 'Close search' : 'Search YouTube'}
        </Button>
      </div>

      {/* player */}
      <div className="relative shrink-0 bg-black">
        <div className="relative aspect-video w-full">
          <div ref={wrapperRef} className="absolute inset-0" />
          {!playerReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
              <p className="text-xs text-neutral-500">
                {apiReady ? 'Preparing player…' : 'Loading YouTube player…'}
              </p>
            </div>
          )}
          {needsGesture && isPlaying && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                joinLocally()
              }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/70 backdrop-blur-[2px]"
              data-testid="tap-to-sync"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E50914] shadow-[0_0_30px_rgba(229,9,20,0.6)]">
                <Play className="h-7 w-7 fill-white text-white" />
              </span>
              <span className="text-sm font-black uppercase tracking-wide text-white">
                Tap to join playback
              </span>
              <span className="text-[10px] text-neutral-400">
                Your browser blocked autoplay — one tap and you&apos;re in sync
              </span>
            </button>
          )}
        </div>
      </div>

      {/* now playing + controls */}
      <div className="shrink-0 space-y-2.5 border-b border-neutral-800 px-4 py-3">
        {hasTrack ? (
          <>
            <div className="min-w-0">
              <p className="line-clamp-2 text-xs font-bold leading-snug text-white" data-testid="now-playing">
                🎤 {karaoke!.title || 'Karaoke track'}
              </p>
              <p className="mt-0.5 text-[10px] text-neutral-500">
                {controllerIsMe ? 'started by you' : `controlled by ${karaoke!.byName || 'someone'}`} · everyone
                hears the same moment
              </p>
              {shownError && (
                <p className="mt-1 rounded border border-[#E50914]/40 bg-[#E50914]/10 px-2 py-1 text-[10px] font-semibold text-[#ff6b6b]">
                  {shownError}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause karaoke for everyone' : 'Play karaoke for everyone'}
                className="h-10 w-10 shrink-0 rounded-full bg-[#E50914] hover:bg-[#F6121D]"
                data-testid="karaoke-play-pause"
              >
                {isPlaying ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white" />}
              </Button>

              <Button
                size="icon"
                onClick={toggleMediaMute}
                aria-label={mediaMuted ? 'Unmute karaoke media' : 'Mute karaoke media'}
                className={`h-10 w-10 shrink-0 rounded-full ${
                  mediaMuted ? 'bg-[#E50914] hover:bg-[#F6121D]' : 'bg-neutral-800 text-white hover:bg-neutral-700'
                }`}
                data-testid="karaoke-media-mute"
              >
                {mediaMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>

              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Karaoke volume"
                className="h-1 w-full cursor-pointer appearance-none rounded-full bg-neutral-700 accent-[#E50914]"
              />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 py-1">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E50914]/15">
              <Youtube className="h-6 w-6 text-[#E50914]" />
            </div>
            <p className="text-xs leading-relaxed text-neutral-400">
              No track on stage yet. Tap{' '}
              <span className="font-bold text-white">Search YouTube</span>, find your karaoke
              track and hit <span className="font-bold text-white">Play on stage</span> — everyone
              in the room hears it.
            </p>
          </div>
        )}
      </div>

      {/* search iframe / queue */}
      {searchOpen ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <iframe
            src="/karaoke-search"
            title="Search YouTube karaoke"
            className="min-h-0 w-full flex-1 border-0 bg-[#141414]"
            data-testid="yt-search-iframe"
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
            <ListMusic className="h-3.5 w-3.5" /> Queue · {karaoke?.queue.length ?? 0}
          </p>
          {!karaoke || karaoke.queue.length === 0 ? (
            <p className="rounded-md border border-dashed border-neutral-800 px-3 py-4 text-center text-[11px] leading-relaxed text-neutral-600">
              Queue is empty. Songs you add from the search window will line up here and play one
              after another.
            </p>
          ) : (
            <ScrollArea className="h-full">
              <ul className="space-y-1.5 pr-2" data-testid="karaoke-queue">
                {karaoke.queue.map((q, i) => (
                  <li
                    key={`${q.videoId}-${i}`}
                    className="flex items-center gap-2 rounded-md bg-neutral-800/50 px-2.5 py-1.5"
                  >
                    <span className="w-4 shrink-0 text-center text-[10px] font-black text-neutral-500">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{q.title || 'Karaoke track'}</p>
                      <p className="truncate text-[10px] text-neutral-500">added by {q.byName}</p>
                    </div>
                    <button
                      onClick={() => onLoad(q.videoId, q.title)}
                      aria-label={`Play ${q.title || 'track'} now`}
                      className="rounded p-1 text-neutral-400 transition hover:bg-[#E50914] hover:text-white"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </button>
                    <button
                      onClick={() => onQueueRemove(i)}
                      aria-label={`Remove ${q.title || 'track'} from queue`}
                      className="rounded p-1 text-neutral-500 transition hover:bg-neutral-700 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      )}

      {/* room-wide "tap to listen" banner — shown OUTSIDE this panel (portal)
          whenever the room is playing but this device isn't heard yet: either
          autoplay was blocked (needsGesture) or the user muted the media.
          One tap — on the banner or anywhere — joins the music. */}
      {hasTrack && isPlaying && playerReady && !panelVisible && (needsGesture || mediaMuted) &&
        createPortal(
          <button
            onClick={(e) => {
              e.stopPropagation()
              joinLocally()
            }}
            data-testid="listen-banner"
            aria-label={mediaMuted ? 'Unmute and listen to the song' : 'Join song playback'}
            className="fixed inset-x-3 bottom-[136px] z-50 flex items-center gap-3 rounded-xl border border-[#E50914]/60 bg-black/95 px-4 py-3 text-left shadow-[0_10px_40px_rgba(0,0,0,0.7)] backdrop-blur transition hover:border-[#E50914] sm:inset-x-auto sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2"
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E50914]">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#E50914]/40" />
              <Volume2 className="relative h-5 w-5 text-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-xs font-black uppercase tracking-wide text-white"
                data-testid="listen-banner-title"
              >
                {mediaMuted ? 'You’re muted — tap for sound' : 'Song live on stage'}
              </span>
              <span className="block truncate text-[10px] text-neutral-400">
                {mediaMuted
                  ? 'One tap and you’re back in the music'
                  : `Tap anywhere to hear “${karaoke?.title || 'the song'}”`}
              </span>
            </span>
            <Play className="h-4 w-4 shrink-0 fill-[#E50914] text-[#E50914]" />
          </button>,
          document.body,
        )}
    </div>
  )
}
