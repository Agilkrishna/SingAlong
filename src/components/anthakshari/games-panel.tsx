'use client'

/**
 * GamesPanel — party games living in the room's side panel:
 *  - 🎲 Quiz: live Bollywood/cricket/GK trivia, 5 questions, 15s each,
 *    first correct answer +100, later ones +50
 *  - 💬 Truth / 💪 Dare / ⚡ Rapid-fire: random prompt cards aimed at a
 *    random person in the room
 * Anyone can start anything — this is a hangout, not a tournament.
 */

import { useEffect, useState } from 'react'
import { Dices, Sparkles, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RoomSnapshot } from '@/hooks/use-room'

type Tab = 'quiz' | 'truth' | 'dare' | 'rapid'

interface GamesPanelProps {
  room: RoomSnapshot
  myId: string
  onQuizStart: () => void
  onQuizAnswer: (choice: number) => void
  onPromptsStart: (mode: 'truth' | 'dare' | 'rapid') => void
  onPromptsNext: () => void
  onPromptsEnd: () => void
}

function useTick(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [active])
  return now
}

export function GamesPanel({
  room,
  myId,
  onQuizStart,
  onQuizAnswer,
  onPromptsStart,
  onPromptsNext,
  onPromptsEnd,
}: GamesPanelProps) {
  const [tab, setTab] = useState<Tab>('quiz')
  const [myAnswer, setMyAnswer] = useState<number | null>(null)
  const quiz = room.quiz ?? null
  const prompts = room.prompts ?? null
  const antak = room.antakshari ?? null
  const ticking = !!quiz || !!antak
  const now = useTick(ticking)

  // a new question resets my local answer
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMyAnswer(null)
  }, [quiz?.index])

  const scores = Object.entries(quiz?.scores ?? {}).sort((a, b) => b[1] - a[1])
  const remaining = quiz ? Math.max(0, quiz.endsAt - now) : 0
  const total = quiz?.phase === 'question' ? 15000 : 4500

  const tabBtn = (value: Tab, label: string) => (
    <button
      key={value}
      onClick={() => setTab(value)}
      aria-pressed={tab === value}
      data-testid={`games-tab-${value}`}
      className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
        tab === value
          ? 'bg-[#E50914] text-white'
          : 'bg-neutral-800/80 text-neutral-400 hover:bg-neutral-700 hover:text-white'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="games-panel">
      <div className="border-b border-neutral-800 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white">
          <Dices className="h-4 w-4 text-[#E50914]" /> Party games
        </h3>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pt-3">
        {tabBtn('quiz', '🎲 Quiz')}
        {tabBtn('truth', '💬 Truth')}
        {tabBtn('dare', '💪 Dare')}
        {tabBtn('rapid', '⚡ Rapid')}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === 'quiz' && (
          <div data-testid="quiz-area">
            {!quiz && (
              <div className="flex flex-col items-start gap-3">
                <p className="text-xs leading-relaxed text-neutral-400">
                  {room.participants.length < 2
                    ? 'Bollywood, cricket & GK trivia for the whole room. Invite a friend and start when they land!'
                    : 'Bollywood, cricket & GK trivia for the whole room — 5 questions, 15 seconds each. First correct answer scores 100!'}
                </p>
                <Button
                  onClick={onQuizStart}
                  data-testid="quiz-start-btn"
                  className="rounded-full bg-[#E50914] px-5 font-black uppercase tracking-wide hover:bg-[#F6121D]"
                >
                  <Sparkles className="mr-1.5 h-4 w-4" /> Start quiz
                </Button>
              </div>
            )}

            {quiz && (
              <div className="flex flex-col gap-3" data-testid="quiz-live">
                <p className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  <span className="flex items-center gap-1.5 text-[#E50914]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#E50914]" />
                    Question {quiz.index + 1}/{quiz.total}
                  </span>
                  <span>{Math.ceil(remaining / 1000)}s</span>
                </p>
                {/* timer bar */}
                <div className="h-1 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-[#E50914] transition-all duration-500"
                    style={{ width: `${Math.min(100, (remaining / total) * 100)}%` }}
                  />
                </div>

                <p className="text-sm font-bold leading-snug text-white" data-testid="quiz-question">
                  {quiz.q}
                </p>

                <div className="flex flex-col gap-2">
                  {quiz.options.map((opt, i) => {
                    const revealed = quiz.phase === 'reveal'
                    const isCorrect = revealed && quiz.correct === i
                    const isMine = myAnswer === i
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          if (quiz.phase !== 'question' || myAnswer !== null) return
                          setMyAnswer(i)
                          onQuizAnswer(i)
                        }}
                        disabled={quiz.phase !== 'question' || myAnswer !== null}
                        data-testid={`quiz-option-${i}`}
                        className={`rounded-lg border px-3 py-2.5 text-left text-xs font-bold transition ${
                          isCorrect
                            ? 'border-green-500 bg-green-500/20 text-green-300'
                            : isMine
                              ? 'border-[#E50914] bg-[#E50914]/20 text-white'
                              : revealed
                                ? 'border-neutral-800 bg-neutral-900 text-neutral-500'
                                : 'border-neutral-700 bg-neutral-800/60 text-neutral-200 hover:border-[#E50914]/60 hover:bg-neutral-800 disabled:opacity-60'
                        }`}
                      >
                        {opt}
                        {isCorrect && <span className="ml-2">✅</span>}
                        {isMine && !isCorrect && <span className="ml-2">your pick</span>}
                      </button>
                    )
                  })}
                </div>

                {quiz.phase === 'question' && myAnswer !== null && (
                  <p className="text-[11px] text-neutral-500" data-testid="quiz-waiting">
                    Answer locked — {quiz.answersCount} in the room answered…
                  </p>
                )}
                {quiz.phase === 'reveal' && (
                  <p className="text-[11px] font-bold text-green-400" data-testid="quiz-reveal">
                    {(quiz.gotIt ?? []).length > 0
                      ? `Nailed it: ${quiz.gotIt!.join(', ')} 🎉`
                      : 'Nobody got this one 😅'}
                  </p>
                )}

                {scores.length > 0 && (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5" data-testid="quiz-score">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                      Scoreboard
                    </p>
                    {scores.map(([name, pts], i) => (
                      <p key={name} className="flex justify-between text-[11px] font-bold text-neutral-300">
                        <span>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'} {name}
                        </span>
                        <span className="text-[#E50914]">{pts}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(tab === 'truth' || tab === 'dare' || tab === 'rapid') && (
          <div className="flex flex-col gap-3" data-testid="prompts-area">
            {prompts && prompts.mode === tab ? (
              <>
                <div className="rounded-xl border border-[#E50914]/40 bg-[#E50914]/10 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#ff6b6b]">
                    {prompts.mode === 'dare' ? '💪 Dare' : prompts.mode === 'rapid' ? '⚡ Rapid-fire' : '💬 Truth'} for{' '}
                    {prompts.target === myName(room, myId) ? 'YOU' : prompts.target}
                  </p>
                  <p className="mt-2 text-sm font-bold leading-snug text-white" data-testid="prompts-text">
                    {prompts.text}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={onPromptsNext}
                    data-testid="prompts-next"
                    className="flex-1 rounded-full bg-[#E50914] font-black uppercase tracking-wide hover:bg-[#F6121D]"
                  >
                    Next →
                  </Button>
                  <Button
                    onClick={onPromptsEnd}
                    data-testid="prompts-end"
                    variant="outline"
                    className="flex-1 rounded-full border-neutral-700 font-black uppercase tracking-wide text-neutral-300 hover:text-white"
                  >
                    End
                  </Button>
                </div>
              </>
            ) : prompts ? (
              <p className="text-xs text-neutral-500">
                A {prompts.mode === 'dare' ? 'Dare' : prompts.mode === 'rapid' ? 'Rapid-fire' : 'Truth'} game is
                already running — switch tabs to see it, or End it from its own tab.
              </p>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-neutral-400">
                  {tab === 'truth'
                    ? 'Spin a question the whole room hears — the target answers honestly (or squirms).'
                    : tab === 'dare'
                      ? 'Dares calibrated for video chat: filmy dances, dialogue-only minutes, dramatic entrances.'
                      : '10-second list challenges — name 3 SRK movies, 5 states, 4 street foods… GO!'}
                </p>
                <Button
                  onClick={() => onPromptsStart(tab)}
                  data-testid="prompts-start"
                  className="self-start rounded-full bg-[#E50914] px-5 font-black uppercase tracking-wide hover:bg-[#F6121D]"
                >
                  <Zap className="mr-1.5 h-4 w-4" />
                  {tab === 'truth' ? 'Spin a truth' : tab === 'dare' ? 'Spin a dare' : 'Rapid-fire!'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function myName(room: RoomSnapshot, myId: string): string {
  return room.participants.find((p) => p.id === myId)?.name ?? ''
}
