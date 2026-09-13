'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ListPlus, Loader2, Play, Search, Youtube } from 'lucide-react'

/**
 * /karaoke-search — rendered inside a dedicated <iframe> within the room's
 * karaoke panel. This is the "separate window for searching YouTube".
 *
 * Picking a song posts a message to the parent room window:
 *   { type: 'karaoke-select', videoId, title }  → play on stage now
 *   { type: 'karaoke-queue',  videoId, title }  → add to the room queue
 */

interface Result {
  videoId: string
  title: string
  channel: string
  duration: string
  thumbnail: string
}

type Sent = { videoId: string; kind: 'play' | 'queue'; at: number } | null

export default function KaraokeSearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [searched, setSearched] = useState(false)
  const [sent, setSent] = useState<Sent>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const post = useCallback((kind: 'play' | 'queue', r: Result) => {
    window.parent.postMessage(
      {
        type: kind === 'play' ? 'karaoke-select' : 'karaoke-queue',
        videoId: r.videoId,
        title: r.title,
      },
      '*',
    )
    setSent({ videoId: r.videoId, kind, at: Date.now() })
    setTimeout(() => setSent(null), 2500)
  }, [])

  const runSearch = useCallback(async (q: string) => {
    const term = q.trim()
    if (!term) return
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(term)}`)
      const data = await res.json()
      if (data.ok) {
        setResults(data.results ?? [])
        setError(data.error ?? '')
      } else {
        setResults([])
        setError(data.error ?? 'Search failed — try again.')
      }
    } catch {
      setResults([])
      setError('Search failed — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  // deep-link ?q=... (the room can pre-fill trending searches)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')
    if (q) {
      setQuery(q)
      void runSearch(q)
    } else {
      inputRef.current?.focus()
    }
  }, [runSearch])

  return (
    <div className="flex h-full flex-col bg-[#141414] text-white">
      {/* compact search header */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void runSearch(query)
        }}
        className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-2.5"
      >
        <Youtube className="h-5 w-5 shrink-0 text-[#FF0000]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search YouTube for karaoke tracks…"
          className="h-9 min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-800/80 px-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-[#E50914]"
          data-testid="yt-search-input"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[#E50914] px-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-[#F6121D] disabled:opacity-40"
          data-testid="yt-search-btn"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </form>

      {/* results */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#E50914]" />
            <p className="text-xs text-neutral-400">Searching YouTube…</p>
          </div>
        )}

        {!loading && error && results.length === 0 && (
          <p className="rounded-md border border-[#E50914]/40 bg-[#E50914]/10 px-3 py-2 text-xs font-semibold text-[#ff6b6b]" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && searched && results.length === 0 && (
          <p className="pt-8 text-center text-xs text-neutral-500">
            Nothing found. Try another song name.
          </p>
        )}

        {!loading && results.length > 0 && (
          <ul className="space-y-2" data-testid="yt-results">
            {results.map((r) => {
              const wasPlay = sent?.videoId === r.videoId && sent.kind === 'play'
              const wasQueue = sent?.videoId === r.videoId && sent.kind === 'queue'
              return (
                <li
                  key={r.videoId}
                  className="flex gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900/70 p-2 transition hover:border-neutral-600"
                >
                  <button
                    onClick={() => post('play', r)}
                    className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md"
                    title="Play on stage now"
                  >
                    <img
                      src={r.thumbnail}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/85 px-1 text-[9px] font-bold text-white">
                      {r.duration}
                    </span>
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-xs font-bold leading-snug text-white" title={r.title}>
                        {r.title}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-neutral-500">{r.channel}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => post('play', r)}
                        className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide transition ${
                          wasPlay
                            ? 'bg-green-600 text-white'
                            : 'bg-[#E50914] text-white hover:bg-[#F6121D]'
                        }`}
                        data-testid={`yt-play-${r.videoId}`}
                      >
                        <Play className="h-3 w-3 fill-white" />
                        {wasPlay ? 'Sent ✓' : 'Play on stage'}
                      </button>
                      <button
                        onClick={() => post('queue', r)}
                        className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                          wasQueue
                            ? 'border-green-500 bg-green-600/20 text-green-400'
                            : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        <ListPlus className="h-3 w-3" />
                        {wasQueue ? 'Queued ✓' : 'Queue'}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {!loading && !searched && (
          <div className="flex flex-col items-center gap-3 pt-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E50914]/15">
              <Search className="h-7 w-7 text-[#E50914]" />
            </div>
            <p className="max-w-[220px] text-xs leading-relaxed text-neutral-400">
              Search YouTube for any song, then hit <span className="font-bold text-white">Play on stage</span> to
              start it for everyone in the room.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
