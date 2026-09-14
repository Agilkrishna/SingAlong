'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clock, Heart, Loader2, Lock, Plus, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { stateByName } from '@/lib/indian-states'
import { LobbyRoom } from '@/hooks/use-room'
import { useLeaderboard } from '@/hooks/use-leaderboard'
import { useToast } from '@/hooks/use-toast'
import { useLang } from '@/lib/i18n'
import { VIBES, vibeLabel } from '@/lib/vibes'

interface LobbyViewProps {
  state: string
  rooms: LobbyRoom[]
  loading: boolean
  joinError: string
  onBack: () => void
  onRefresh: () => void
  onJoin: (roomId: string) => void
  onCreateRoom: (
    name: string,
    kind: 'hangout' | 'sing',
    tags: string[],
    passcode?: string,
    scheduleAt?: number,
  ) => void
  onJoinByCode: (code: string) => void
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
  const { t, lang, toggleLang } = useLang()
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomKind, setNewRoomKind] = useState<'hangout' | 'sing'>('hangout')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newPasscode, setNewPasscode] = useState('')
  const [newSchedule, setNewSchedule] = useState('')
  const [reminded, setReminded] = useState<string[]>([])
  const [filter, setFilter] = useState<'all' | 'hangout' | 'sing'>('all')
  const [vibe, setVibe] = useState<string>('all')
  const [code, setCode] = useState('')
  const { singers: board, status, reload: loadBoard } = useLeaderboard(state)
  const { toast } = useToast()

  // in-page reminders for scheduled rooms ("🔔 Remind me")
  const remindTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const timers = remindTimersRef.current
    return () => timers.forEach((t) => clearTimeout(t))
  }, [])

  const setReminder = (room: LobbyRoom) => {
    if (!room.scheduleAt || reminded.includes(room.id)) return
    const delay = Math.max(0, room.scheduleAt - Date.now())
    const t = setTimeout(() => {
      toast({
        title: `⏰ ${room.name} is starting now!`,
        description: 'Tap it in the list to join.',
      })
      setReminded((prev) => [...prev, room.id])
    }, delay)
    remindTimersRef.current.push(t)
    // optimistic label swap (toast fires later)
    setReminded((prev) => (prev.includes(room.id) ? prev : [...prev, room.id]))
    toast({ title: 'Reminder set 🔔', description: `We'll nudge you when ${room.name} starts.` })
  }

  const countdown = (at: number) => {
    const mins = Math.round((at - Date.now()) / 60000)
    if (mins < 1) return 'starting now'
    if (mins < 60) return `in ${mins} min`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`
  }

  const scheduleTime = (at: number) => {
    try {
      return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  // lobby tabs — All shows everything; Hangouts / Singing narrow by room type
  // (a room without `kind` is from an older server → treat as hangout)
  const featured = rooms.find((r) => r.isDefault)
  const showFeatured = !!featured && filter !== 'sing'
  const now = Date.now()
  const upcoming = rooms.filter(
    (r) => !r.isDefault && r.count === 0 && (r.scheduleAt ?? 0) > now,
  )
  const others = rooms.filter(
    (r) =>
      !r.isDefault &&
      r.count > 0 &&
      (filter === 'all' || (r.kind ?? 'hangout') === filter) &&
      (vibe === 'all' || (r.tags ?? []).includes(vibe)),
  )

  const toggleTag = (slug: string) => {
    setSelectedTags((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length >= 3
          ? prev // max 3 vibes per room
          : [...prev, slug],
    )
  }

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
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              {meta?.emoji} {state}
              <span className="ml-2 text-base font-bold text-[#E50914]">{t('hangoutsTitle')}</span>
            </h1>
            <button
              onClick={toggleLang}
              data-testid="lang-toggle"
              className="shrink-0 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-300 transition hover:border-[#E50914] hover:text-white"
              title="English / Hinglish"
            >
              {lang === 'en' ? 'हिंदी' : 'EN'}
            </button>
          </div>
          <p className="mt-1 text-xs text-neutral-400 sm:text-sm">
            {t('lobbySub')} {state}.
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

        {/* lobby filter tabs — All · 💬 Hangouts · 🎤 Singing */}
        <div
          className="mb-5 flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900/80 p-1"
          data-testid="lobby-filters"
          role="tablist"
          aria-label="Filter rooms by type"
        >
          {(
            [
              ['all', t('allTab')],
              ['hangout', '💬 Hangouts'],
              ['sing', '🎤 Singing'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              data-testid={`filter-${value}`}
              className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-black uppercase tracking-wider transition sm:text-xs ${
                filter === value
                  ? 'bg-[#E50914] text-white shadow-lg shadow-[#E50914]/25'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* vibe filter — rooms carry up to 3 vibe tags from creation */}
        <div
          className="mb-5 flex flex-wrap items-center gap-1.5"
          data-testid="vibe-filters"
          role="group"
          aria-label="Filter rooms by vibe"
        >
          <span className="mr-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {t('vibesLabel')}:
          </span>
          {[['all', '✨ All'] as const, ...VIBES.map((v) => [v.slug, `${v.emoji} ${v.label}`] as const)].map(
            ([slug, label]) => (
              <button
                key={slug}
                onClick={() => setVibe(slug)}
                aria-pressed={vibe === slug}
                data-testid={`vibe-filter-${slug}`}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                  vibe === slug
                    ? 'bg-[#E50914] text-white'
                    : 'bg-neutral-800/80 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>

        {/* featured stage */}
        {showFeatured && (
          <>
            <h2 className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-neutral-500">
              State hangout
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
                    ? `${featured.count} ${t('hangingOut')}`
                    : t('firstHere')}
                  {featured.live ? ' · 🎤 Sing Along live' : ''}
                </span>
              </span>
              <span className="rounded-md bg-[#E50914] px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-colors group-hover:bg-[#F6121D]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join'}
              </span>
            </button>
          </>
        )}

        {/* starting soon — scheduled rooms waiting for their crowd */}
        {upcoming.length > 0 && (
          <>
            <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.25em] text-neutral-500">
              <Clock className="h-3.5 w-3.5" /> {t('startingSoon')}
            </h2>
            <div className="mb-6 flex flex-col gap-2">
              {upcoming.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-[#F5A623]/50 bg-[#F5A623]/5 p-3"
                  data-testid={`scheduled-${r.id}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-bold text-white">{r.name}</span>
                      {r.locked && <Lock className="h-3 w-3 shrink-0 text-neutral-500" />}
                    </span>
                    <span className="block text-[11px] text-[#F5A623]">
                      ⏰ {scheduleTime(r.scheduleAt!)} · {countdown(r.scheduleAt!)}
                    </span>
                  </span>
                  <button
                    onClick={() => setReminder(r)}
                    disabled={reminded.includes(r.id)}
                    data-testid={`remind-${r.id}`}
                    className="shrink-0 rounded-full border border-[#F5A623]/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#F5A623] transition hover:bg-[#F5A623] hover:text-black disabled:opacity-50"
                  >
                    {reminded.includes(r.id) ? '🔔 Set' : t('remindMe')}
                  </button>
                  <button
                    onClick={() => onJoin(r.id)}
                    data-testid={`join-scheduled-${r.id}`}
                    className="shrink-0 rounded-full bg-neutral-800 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-200 transition hover:bg-[#E50914]"
                  >
                    Go early
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* other rooms */}
        {others.length > 0 && (
          <>
            <h2 className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-neutral-500">
              {t('liveHere')} {state}
            </h2>
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {others.map((r) => {
                const isSing = (r.kind ?? 'hangout') === 'sing'
                return (
                  <button
                    key={r.id}
                    onClick={() => onJoin(r.id)}
                    className="group flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3.5 text-left transition-all hover:border-[#E50914]/60 hover:bg-neutral-800"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate text-sm font-bold text-white">{r.name}</span>
                        {r.locked && (
                          <span
                            className="shrink-0 rounded bg-neutral-800 px-1 py-0.5 text-[9px] font-bold text-neutral-400"
                            title="Passcode-locked room"
                          >
                            🔒
                          </span>
                        )}
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                            isSing ? 'bg-[#E50914]/20 text-[#ff6b6b]' : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {isSing ? '🎤 Singing' : '💬 Hangout'}
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-neutral-400">
                        {r.count}/8 here{r.live ? ' · 🎤 sing along on' : ''} ·{' '}
                        <span className="font-mono text-neutral-500">{r.id}</span>
                      </span>
                      {(r.tags?.length ?? 0) > 0 && (
                        <span
                          className="mt-1 flex flex-wrap gap-1"
                          data-testid={`room-tags-${r.id}`}
                        >
                          {r.tags!.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-neutral-800 px-2 py-0.5 text-[9px] font-bold text-neutral-300"
                            >
                              {vibeLabel(tag)}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="rounded bg-[#E50914] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white opacity-90 group-hover:opacity-100">
                      Join
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* per-type empty states */}
        {filter === 'sing' && others.length === 0 && (
          <p
            className="mb-6 rounded-xl border border-dashed border-neutral-800 bg-neutral-900/40 px-4 py-6 text-center text-xs leading-relaxed text-neutral-500"
            data-testid="singing-empty"
          >
            {t('singingEmpty')}
          </p>
        )}
        {filter === 'hangout' && others.length === 0 && (
          <p
            className="mb-6 rounded-xl border border-dashed border-neutral-800 bg-neutral-900/40 px-4 py-6 text-center text-xs leading-relaxed text-neutral-500"
            data-testid="hangout-empty"
          >
            {t('noOtherHangouts')} {state} {t('hangoutEmpty')}
          </p>
        )}

        {/* create room — pick the type first, then name it */}
        <h2 className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-neutral-500">
          {t('openOwn')}
        </h2>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => setNewRoomKind('hangout')}
            aria-pressed={newRoomKind === 'hangout'}
            data-testid="create-kind-hangout"
            className={`rounded-xl border p-3 text-left transition ${
              newRoomKind === 'hangout'
                ? 'border-[#E50914] bg-[#E50914]/15'
                : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'
            }`}
          >
            <span className="block text-sm font-black text-white">💬 Hangout</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-neutral-500">
              {t('hangoutDesc')}
            </span>
          </button>
          <button
            onClick={() => setNewRoomKind('sing')}
            aria-pressed={newRoomKind === 'sing'}
            data-testid="create-kind-sing"
            className={`rounded-xl border p-3 text-left transition ${
              newRoomKind === 'sing'
                ? 'border-[#E50914] bg-[#E50914]/15'
                : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'
            }`}
          >
            <span className="block text-sm font-black text-white">🎤 Singing room</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-neutral-500">
              {t('singDesc')}
            </span>
          </button>
        </div>

        {/* vibe tags — up to 3, shown on the room card + filterable */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {t('vibesLabel')} (max 3):
          </span>
          {VIBES.map((v) => {
            const on = selectedTags.includes(v.slug)
            return (
              <button
                key={v.slug}
                onClick={() => toggleTag(v.slug)}
                aria-pressed={on}
                data-testid={`tag-chip-${v.slug}`}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                  on
                    ? 'bg-[#E50914] text-white'
                    : 'bg-neutral-800/80 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                }`}
              >
                {v.emoji} {v.label}
              </button>
            )
          })}
        </div>

        {/* lock + schedule — private rooms and "tonight 9 PM" plans */}
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            value={newPasscode}
            onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder={t('passcodeLabel')}
            inputMode="numeric"
            data-testid="new-room-passcode"
            className="h-11 border-neutral-700 bg-neutral-800/60 text-sm text-white placeholder:text-neutral-500"
            aria-label="Optional room passcode"
          />
          <Input
            type="datetime-local"
            value={newSchedule}
            onChange={(e) => setNewSchedule(e.target.value)}
            aria-label={t('scheduleFor')}
            data-testid="new-room-schedule"
            className="h-11 border-neutral-700 bg-neutral-800/60 text-sm text-white [color-scheme:dark]"
          />
        </div>

        <div className="mb-8 flex gap-2">
          <Input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value.slice(0, 40))}
            onKeyDown={(e) =>
              e.key === 'Enter' &&
              newRoomName.trim() &&
              onCreateRoom(
                newRoomName.trim(),
                newRoomKind,
                selectedTags,
                newPasscode || undefined,
                newSchedule ? new Date(newSchedule).getTime() : undefined,
              )
            }
            placeholder={newRoomKind === 'sing' ? `e.g. "${state} Antakshari Night"` : `e.g. "${state} Weekend Adda"`}
            className="h-11 border-neutral-700 bg-neutral-800/60 text-sm text-white placeholder:text-neutral-500"
            aria-label="New room name"
            data-testid="new-room-name"
          />
          <Button
            onClick={() =>
              onCreateRoom(
                newRoomName.trim(),
                newRoomKind,
                selectedTags,
                newPasscode || undefined,
                newSchedule ? new Date(newSchedule).getTime() : undefined,
              )
            }
            disabled={!newRoomName.trim()}
            data-testid="create-room-btn"
            className="h-11 shrink-0 rounded-md bg-[#E50914] px-5 font-black uppercase tracking-wide hover:bg-[#F6121D] disabled:opacity-40"
          >
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </div>

        {/* top singers in this state */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-neutral-500">
              <Trophy className="h-4 w-4 text-[#F5A623]" /> {t('topSingersBox')} {state}
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onRefresh()
                loadBoard()
              }}
              data-testid="leaderboard-refresh"
              className="h-7 rounded-full px-2 text-[11px] text-neutral-400 hover:text-white"
            >
              Refresh
            </Button>
          </div>
          {board && board.length > 0 ? (
            <>
              {status === 'error' && (
                <p
                  className="mb-2 rounded-md border border-[#E50914]/30 bg-[#E50914]/10 px-2 py-1.5 text-[11px] text-[#ff6b6b]"
                  data-testid="leaderboard-error"
                >
                  Couldn&apos;t refresh — showing the last board.
                  <button
                    onClick={loadBoard}
                    className="ml-1 font-bold text-[#E50914] underline underline-offset-2 hover:text-[#F6121D]"
                  >
                    Retry
                  </button>
                </p>
              )}
              <ol className="space-y-1">
              {board.slice(0, 8).map((s, i) => (
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
            </>
          ) : status === 'error' ? (
            <p className="py-2 text-xs text-neutral-600" data-testid="leaderboard-error">
              Couldn&apos;t load the board just now.
              <button
                onClick={loadBoard}
                className="ml-1 font-bold text-[#E50914] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </p>
          ) : (
            <p className="py-2 text-xs text-neutral-600" data-testid="leaderboard-empty">
              {status === 'loading'
                ? 'Loading…'
                : `No applause in ${state} yet — start a Sing Along and earn the first popper!`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
