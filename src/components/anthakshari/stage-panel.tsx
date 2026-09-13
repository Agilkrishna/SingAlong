'use client'

import { useState } from 'react'
import { Armchair, LogOut, Mic, Music4, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApplauseKind, Participant, StageState } from '@/hooks/use-room'

interface StagePanelProps {
  stage: StageState | null
  participants: Participant[]
  myId: string
  /** onSuccess fires when the server confirms the seat (used by RoomView to close the panel) */
  onTakeSeat: (onSuccess?: () => void) => void
  onLeaveSeat: () => void
  onAward: (kind: ApplauseKind) => void
}

function StatChip({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900/80 px-2 py-2.5 text-center">
      <p className={`text-xl font-black leading-none ${accent ? 'text-[#E50914]' : 'text-white'}`} data-testid={`stat-${label.toLowerCase()}`}>
        {value}
      </p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500">{label}</p>
    </div>
  )
}

export function StagePanel({ stage, participants, myId, onTakeSeat, onLeaveSeat, onAward }: StagePanelProps) {
  const [busy, setBusy] = useState<ApplauseKind | null>(null)

  const iAmOnSeat = !!stage && stage.singerId === myId
  const singer = participants.find((p) => p.id === stage?.singerId)

  const tap = (kind: ApplauseKind) => {
    setBusy(kind)
    onAward(kind)
    setTimeout(() => setBusy((b) => (b === kind ? null : b)), 450)
  }

  return (
    <div className="flex h-full flex-col" data-testid="stage-panel">
      <div className="border-b border-neutral-800 px-4 py-3">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">The Main Seat</h3>
        <p className="mt-0.5 text-[11px] text-neutral-500">No rounds, no competition — just take the mic and sing.</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* ------------------------------ empty seat ------------------------------ */}
        {!stage && (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center" data-testid="seat-empty">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#E50914]/15">
              <Mic className="h-9 w-9 text-[#E50914]" />
            </div>
            <div>
              <p className="text-lg font-black text-white">The Main Seat is free</p>
              <p className="mx-auto mt-1.5 max-w-[260px] text-xs leading-relaxed text-neutral-400">
                Grab the mic, pick a karaoke track and sing. Everyone else can shower you with
                <span className="font-bold text-[#E50914]"> poppers (+10)</span> and
                <span className="font-bold text-[#E50914]"> hearts (+100)</span>.
              </p>
            </div>
            <Button
              onClick={() => onTakeSeat()}
              className="h-12 w-full max-w-xs rounded-md bg-[#E50914] text-sm font-black uppercase tracking-widest hover:bg-[#F6121D]"
              data-testid="take-seat"
            >
              <Armchair className="mr-2 h-5 w-5" /> Take the Main Seat
            </Button>
            <p className="text-[11px] text-neutral-600">
              {participants.length} singer{participants.length === 1 ? '' : 's'} in the room
            </p>
          </div>
        )}

        {/* ------------------------------ I am singing ---------------------------- */}
        {stage && iAmOnSeat && (
          <div className="flex h-full flex-col gap-4" data-testid="seat-mine">
            <div className="rounded-xl border border-[#E50914]/50 bg-gradient-to-r from-[#E50914]/20 to-transparent p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#E50914]">Live now</p>
              <p className="mt-1 text-lg font-black text-white">You&apos;re in the Main Seat 🎤</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-300">
                Sing your heart out! Every popper the room throws adds <b>+10</b>, every heart adds
                <b> +100</b>. Points land on the home-page leaderboard.
              </p>
            </div>

            <div className="flex gap-2">
              <StatChip label="Points" value={stage.points} accent />
              <StatChip label="Poppers" value={stage.poppers} />
              <StatChip label="Hearts" value={stage.hearts} />
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs leading-relaxed text-neutral-400">
              <p className="mb-1 flex items-center gap-1.5 font-bold text-neutral-200">
                <Music4 className="h-3.5 w-3.5 text-[#E50914]" /> Pro tip
              </p>
              Open the YouTube tab below, queue a karaoke track and sing along — the whole room hears it in sync.
            </div>

            <div className="mt-auto">
              <Button
                onClick={onLeaveSeat}
                variant="outline"
                className="h-11 w-full rounded-md border-neutral-700 bg-transparent text-xs font-bold uppercase tracking-widest text-neutral-300 hover:bg-neutral-800 hover:text-white"
                data-testid="leave-seat"
              >
                <LogOut className="mr-2 h-4 w-4" /> Step down
              </Button>
            </div>
          </div>
        )}

        {/* --------------------------- someone else sings ------------------------- */}
        {stage && !iAmOnSeat && (
          <div className="flex h-full flex-col gap-4" data-testid="seat-other">
            <div className="flex items-center gap-3 rounded-xl border border-[#E50914]/40 bg-gradient-to-r from-[#E50914]/15 to-transparent p-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
                style={{ backgroundColor: stage.singerColor || singer?.color || '#E50914' }}
              >
                {stage.singerName.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#E50914]">In the Main Seat</p>
                <p className="truncate text-lg font-black text-white" data-testid="seat-singer-name">
                  {stage.singerName}
                  {singer && <span className="ml-1 text-xs font-normal text-neutral-500">(singing now)</span>}
                </p>
              </div>
            </div>

            {/* award buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => tap('popper')}
                className="group flex flex-col items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 py-4 transition-all hover:border-[#F5A623]/70 active:scale-95 disabled:opacity-50"
                data-testid="award-popper"
                aria-label="Throw a popper — give 10 points"
              >
                <span className={`text-4xl transition-transform ${busy === 'popper' ? 'scale-125' : 'group-hover:scale-110'}`}>🎉</span>
                <span className="text-[11px] font-black uppercase tracking-widest text-neutral-300">Popper</span>
                <span className="rounded-full bg-[#F5A623]/15 px-2 py-0.5 text-[11px] font-black text-[#F5A623]">+10 pts</span>
              </button>
              <button
                onClick={() => tap('heart')}
                className="group flex flex-col items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 py-4 transition-all hover:border-[#E50914]/70 active:scale-95 disabled:opacity-50"
                data-testid="award-heart"
                aria-label="Send a heart — give 100 points"
              >
                <span className={`text-4xl transition-transform ${busy === 'heart' ? 'scale-125' : 'group-hover:scale-110'}`}>❤️</span>
                <span className="text-[11px] font-black uppercase tracking-widest text-neutral-300">Heart</span>
                <span className="rounded-full bg-[#E50914]/15 px-2 py-0.5 text-[11px] font-black text-[#E50914]">+100 pts</span>
              </button>
            </div>

            <p className="text-center text-[11px] leading-relaxed text-neutral-500">
              <Sparkles className="mr-1 inline h-3 w-3 text-[#F5A623]" />
              Extraordinary singing? Send a <b className="text-[#E50914]">heart</b>. Points go straight to the
              home-page leaderboard.
            </p>

            <div className="flex gap-2">
              <StatChip label="Points" value={stage.points} accent />
              <StatChip label="Poppers" value={stage.poppers} />
              <StatChip label="Hearts" value={stage.hearts} />
            </div>

            <p className="mt-auto text-center text-[11px] text-neutral-600">
              The seat opens up when {stage.singerName} steps down.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* popper + heart quick-award buttons (shown in the room when someone else sings) */
export function QuickAwardButtons({
  onAward,
  offsetWithMiniPlayer,
}: {
  onAward: (kind: ApplauseKind) => void
  offsetWithMiniPlayer: boolean
}) {
  return (
    <div
      className={`fixed left-3 z-40 flex flex-col gap-2 ${offsetWithMiniPlayer ? 'bottom-36' : 'bottom-24'}`}
      data-testid="quick-award"
    >
      <button
        onClick={() => onAward('popper')}
        aria-label="Throw a popper (+10 points)"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-700 bg-black/85 text-2xl shadow-lg shadow-black/50 backdrop-blur transition-transform active:scale-90 hover:border-[#F5A623]"
      >
        🎉
      </button>
      <button
        onClick={() => onAward('heart')}
        aria-label="Send a heart (+100 points)"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-700 bg-black/85 text-2xl shadow-lg shadow-black/50 backdrop-blur transition-transform active:scale-90 hover:border-[#E50914]"
      >
        ❤️
      </button>
    </div>
  )
}
