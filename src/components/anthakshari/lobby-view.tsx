'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Heart, Loader2, Plus, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { stateByName } from '@/lib/indian-states'
import { LobbyRoom } from '@/hooks/use-room'

interface LobbyViewProps {
  state: string
  rooms: LobbyRoom[]
  loading: boolean
  joinError: string
  onBack: () => void
  onRefresh: () => void
  onJoin: (roomId: string) => void
  onCreateRoom: (name: string) => void
  onJoinByCode: (code: string) => void
}

interface LeaderboardData {
  singers: { name: string; points: number; hearts: number; performances: number }[]
}

export function LobbyView({
  state,
  rooms,
  loading,
  joinError,
  onBack,
  onRefresh,
  onJoin,
  onCreateRoom,
  onJoinByCode,
}: LobbyViewProps) {
  const meta = stateByName(state)
  const [newRoomName, setNewRoomName] = useState('')
  const [code, setCode] = useState('')
  const [board, setBoard] = useState<LeaderboardData | null>(null)

  const loadBoard = useCallback(async () => {
    try {
      const res = await fetch(`/api/leaderboard?state=${encodeURIComponent(state)}`)
      const data = await res.json()
      if (data?.ok) setBoard(data)
    } catch {}
  }, [state])

  useEffect(() => {
    // fetch resolves before setState, so the update is async (fetch-then-render)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBoard()
  }, [loadBoard])

  const featured = rooms.find((r) => r.isDefault)
  const others = rooms.filter((r) => !r.isDefault)

  return (
    <div className="min-h-[100dvh] bg-[#141414] text-white">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-5">
        <Button
          variant="ghost"
          onClick={onBack}
          className="mb-4 -ml-2 h-9 rounded-full px-3 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> All states
        </Button>

        {/* state header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            {meta?.emoji} {state}
            <span className="ml-2 text-base font-bold text-[#E50914]">Stages</span>
          </h1>
          <p className="mt-1 text-xs text-neutral-400 sm:text-sm">
            Join a live stage or open your own — anyone in {state} can hop in.
          </p>
        </div>

        {/* join by code */}
        <div className="mb-6 flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
            placeholder="ROOM CODE (e.g. 7K2MX)"
            className="h-11 border-neutral-700 bg-neutral-800/60 font-mono text-sm uppercase tracking-widest text-white placeholder:font-sans placeholder:text-xs placeholder:tracking-normal placeholder:text-neutral-500"
            aria-label="Join by room code"
          />
          <Button
            onClick={() => code.length === 5 && onJoinByCode(code)}
            disabled={code.length !== 5}
            className="h-11 shrink-0 rounded-md bg-[#E50914] px-5 font-black uppercase tracking-wide hover:bg-[#F6121D] disabled:opacity-40"
          >
            Join
          </Button>
        </div>

        {joinError && (
          <p className="mb-4 rounded-md border border-[#E50914]/40 bg-[#E50914]/10 px-3 py-2 text-xs text-[#ff6b6b]" data-testid="join-error">
            {joinError}
          </p>
        )}

        {/* featured stage */}
        {featured && (
          <>
            <h2 className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-neutral-500">
              Featured stage
            </h2>
            <button
              onClick={() => onJoin(featured.id)}
              data-testid="join-featured"
              className="group mb-6 flex w-full items-center gap-4 overflow-hidden rounded-xl border border-neutral-800 bg-gradient-to-r from-[#E50914]/25 via-neutral-900 to-neutral-900 p-4 text-left transition-all hover:border-[#E50914]/60 hover:shadow-[0_0_30px_rgba(229,9,20,0.2)]"
            >
              <span className="text-3xl">{meta?.emoji ?? '🎤'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-black text-white">{featured.name}</span>
                <span className="block text-xs text-neutral-400">
                  {featured.count > 0
                    ? `${featured.count} singer${featured.count === 1 ? '' : 's'} on stage now`
                    : 'Be the first on stage'}
                  {featured.live ? ' · 🎤 Main Seat live' : ''}
                </span>
              </span>
              <span className="rounded-md bg-[#E50914] px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-colors group-hover:bg-[#F6121D]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join'}
              </span>
            </button>
          </>
        )}

        {/* other rooms */}
        {others.length > 0 && (
          <>
            <h2 className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-neutral-500">
              Live in {state}
            </h2>
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {others.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onJoin(r.id)}
                  className="group flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3.5 text-left transition-all hover:border-[#E50914]/60 hover:bg-neutral-800"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-white">{r.name}</span>
                    <span className="block text-[11px] text-neutral-400">
                      {r.count}/8 singers{r.live ? ' · 🎤 live seat' : ''} ·{' '}
                      <span className="font-mono text-neutral-500">{r.id}</span>
                    </span>
                  </span>
                  <span className="rounded bg-[#E50914] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white opacity-90 group-hover:opacity-100">
                    Join
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* create room */}
        <h2 className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-neutral-500">
          Open your own stage
        </h2>
        <div className="mb-8 flex gap-2">
          <Input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value.slice(0, 40))}
            onKeyDown={(e) => e.key === 'Enter' && newRoomName.trim() && onCreateRoom(newRoomName.trim())}
            placeholder={`e.g. "${state} Retro Hits Night"`}
            className="h-11 border-neutral-700 bg-neutral-800/60 text-sm text-white placeholder:text-neutral-500"
            aria-label="New room name"
          />
          <Button
            onClick={() => newRoomName.trim() && onCreateRoom(newRoomName.trim())}
            disabled={!newRoomName.trim()}
            className="h-11 shrink-0 rounded-md bg-[#E50914] px-5 font-black uppercase tracking-wide hover:bg-[#F6121D] disabled:opacity-40"
          >
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </div>

        {/* top singers in this state */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-neutral-500">
              <Trophy className="h-4 w-4 text-[#F5A623]" /> Top Singers · {state}
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onRefresh()
                loadBoard()
              }}
              className="h-7 rounded-full px-2 text-[11px] text-neutral-400 hover:text-white"
            >
              Refresh
            </Button>
          </div>
          {board && board.singers.length > 0 ? (
            <ol className="space-y-1">
              {board.singers.slice(0, 8).map((s, i) => (
                <li
                  key={s.name}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${i < 3 ? 'bg-[#E50914]/10' : ''}`}
                >
                  <span className="w-6 text-center text-xs font-black text-neutral-500">
                    {['🥇', '🥈', '🥉'][i] ?? i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">{s.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-neutral-500">
                    <Heart className="h-3 w-3 fill-[#E50914] text-[#E50914]" />
                    {s.hearts}
                  </span>
                  <span className="w-14 shrink-0 text-right text-sm font-black text-[#E50914]">
                    {s.points}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-2 text-xs text-neutral-600">
              {board === null
                ? 'Loading…'
                : `No applause recorded in ${state} yet — take the Main Seat and earn the first popper!`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
