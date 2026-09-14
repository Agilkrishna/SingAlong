'use client'

import { useState } from 'react'
import { Heart, Loader2, LocateFixed, Shuffle, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { INDIAN_STATES, AnonymousProfile } from '@/lib/indian-states'
import { useLeaderboard } from '@/hooks/use-leaderboard'
import { useLang } from '@/lib/i18n'

interface LandingViewProps {
  profile: AnonymousProfile
  welcomeBack: boolean
  onShuffleProfile: () => void
  onRename: (name: string) => void
  onPickState: (state: string) => void
  onDetectLocation: () => void
  detecting: boolean
  detectNote: string
}

const RANK_MEDALS = ['🥇', '🥈', '🥉']

export function LandingView({
  profile,
  welcomeBack,
  onShuffleProfile,
  onRename,
  onPickState,
  onDetectLocation,
  detecting,
  detectNote,
}: LandingViewProps) {
  const [search, setSearch] = useState('')
  const { t, lang, toggleLang } = useLang()
  const { singers: board, status, reload: loadBoard } = useLeaderboard()

  const states = INDIAN_STATES.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  return (
    <div className="min-h-[100dvh] bg-[#141414] pb-16 text-white">
      {/* nav */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-gradient-to-b from-black/95 to-black/70 px-4 py-3 backdrop-blur-sm">
        <span
          className="select-none text-2xl font-black tracking-tighter text-[#E50914] sm:text-3xl"
          style={{ textShadow: '0 2px 12px rgba(229,9,20,0.45)' }}
          data-testid="logo"
        >
          DESI&nbsp;HANGOUT
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-neutral-800/90 px-3 py-1.5 text-xs text-neutral-300">
            {t('badge')}
          </span>
          <button
            onClick={toggleLang}
            data-testid="lang-toggle"
            className="rounded-full border border-neutral-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-300 transition hover:border-[#E50914] hover:text-white"
            title="English / Hinglish"
          >
            {lang === 'en' ? 'हिंदी' : 'EN'}
          </button>
        </span>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 70% -10%, rgba(229,9,20,0.35), transparent 60%), radial-gradient(ellipse 60% 50% at 10% 110%, rgba(229,9,20,0.18), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 pb-10 pt-14 text-center sm:pt-20">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.35em] text-[#E50914] sm:text-xs">
            {t('eyebrow')}
          </p>
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            {t('hero1')}
            <span className="block bg-gradient-to-r from-[#E50914] via-[#ff4d4d] to-[#E50914] bg-clip-text text-transparent">
              {t('hero2')}
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-neutral-400 sm:text-base">
            {t('heroSub')}
          </p>

          {/* anonymous identity */}
          <div className="mx-auto mt-7 flex max-w-md flex-col items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 backdrop-blur-sm sm:flex-row">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
              style={{ backgroundColor: profile.color }}
              data-testid="avatar-preview"
            >
              {profile.name.slice(0, 2).toUpperCase()}
            </span>
            <Input
              value={profile.name}
              onChange={(e) => onRename(e.target.value.replace(/\s/g, '').slice(0, 16))}
              aria-label="Your anonymous stage name"
              className="h-10 flex-1 border-neutral-700 bg-neutral-800/80 text-center text-sm font-bold text-white sm:text-left"
              data-testid="name-input"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={onShuffleProfile}
              aria-label="Shuffle anonymous identity"
              className="h-10 w-10 shrink-0 rounded-full border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              <Shuffle className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-neutral-600" data-testid="identity-note">
            {welcomeBack ? (
              <span className="font-semibold text-neutral-400" data-testid="welcome-back">
                👋 Welcome back, <b className="text-white">{profile.name}</b>{' '}
                {t('savedNote')}
              </span>
            ) : (
              <>{t('freshNote')}</>
            )}
          </p>

          {/* CTAs */}
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              onClick={onDetectLocation}
              disabled={detecting}
              className="h-12 w-full max-w-xs rounded-md bg-[#E50914] text-sm font-black uppercase tracking-widest hover:bg-[#F6121D] sm:w-56"
              data-testid="detect-location"
            >
              {detecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="mr-2 h-4 w-4" />
              )}
              {detecting ? t('finding') : t('useLocation')}
            </Button>
            <Button
              onClick={() => document.getElementById('state-grid')?.scrollIntoView({ behavior: 'smooth' })}
              variant="outline"
              className="h-12 w-full max-w-xs rounded-md border-neutral-600 bg-white/5 text-sm font-bold uppercase tracking-widest text-white hover:bg-white/10 sm:w-56"
            >
              {t('pickState')}
            </Button>
          </div>
          {detectNote && (
            <p className="mt-3 text-xs text-neutral-400" data-testid="detect-note">
              {detectNote}
            </p>
          )}
        </div>
      </section>

      {/* state grid */}
      <section id="state-grid" className="mx-auto max-w-3xl px-4 pt-6">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-black tracking-tight sm:text-xl">
            {t('roomsNearYou')} <span className="text-[#E50914]">{t('you')}</span>
          </h2>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchStates')}
            className="h-9 w-40 border-neutral-700 bg-neutral-800/60 text-xs text-white placeholder:text-neutral-500 sm:w-56"
            aria-label="Search states"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4" data-testid="state-grid">
          {states.map((s) => (
            <button
              key={s.name}
              onClick={() => onPickState(s.name)}
              data-testid={`state-${s.name.toLowerCase().replace(/[^a-z]+/g, '-')}`}
              className="group relative flex h-20 items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 transition-all duration-200 hover:z-10 hover:scale-105 hover:border-[#E50914]/70 hover:shadow-[0_8px_30px_rgba(229,9,20,0.25)] sm:h-24"
            >
              <span
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(229,9,20,0.25) 0%, transparent 55%)',
                }}
              />
              <span className="flex flex-col items-center gap-1 px-2">
                <span className="text-xl sm:text-2xl" aria-hidden>
                  {s.emoji}
                </span>
                <span className="text-center text-[11px] font-bold leading-tight text-neutral-200 group-hover:text-white sm:text-xs">
                  {s.name}
                </span>
              </span>
            </button>
          ))}
          {states.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-neutral-500">
              No state matches &ldquo;{search}&rdquo;.
            </p>
          )}
        </div>
      </section>

      {/* leaderboard */}
      <section className="mx-auto mt-12 max-w-3xl px-4" data-testid="leaderboard">
        <div className="mb-1 flex items-end justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black tracking-tight sm:text-xl">
            <Trophy className="h-5 w-5 text-[#F5A623]" />
            {t('topSingers')} <span className="text-[#E50914]">{t('singers')}</span>
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadBoard}
            data-testid="leaderboard-refresh"
            className="h-7 rounded-full px-2 text-[11px] text-neutral-400 hover:text-white"
          >
            Refresh
          </Button>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          Every popper (+10) and heart (+100) the room throws at the Main Seat lands here —
          across all states.
        </p>

        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60">
          {board && board.length > 0 ? (
            <>
              {status === 'error' && (
                <p
                  className="border-b border-[#E50914]/30 bg-[#E50914]/10 px-4 py-2 text-[11px] text-[#ff6b6b]"
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
              <ol className="divide-y divide-neutral-800">
              {board.slice(0, 10).map((s, i) => (
                <li
                  key={s.name}
                  className={`flex items-center gap-3 px-4 py-3 ${i < 3 ? 'bg-gradient-to-r from-[#E50914]/10 to-transparent' : ''}`}
                  data-testid={`leader-row-${i}`}
                >
                  <span className="w-8 shrink-0 text-center text-sm font-black text-neutral-400">
                    {RANK_MEDALS[i] ?? i + 1}
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E50914] to-[#7b0508] text-xs font-black text-white">
                    {s.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-white">{s.name}</span>
                    <span className="block truncate text-[10px] uppercase tracking-widest text-neutral-500">
                      {s.state || 'India'}
                      {s.performances > 0 && ` · ${s.performances} seat${s.performances === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-neutral-500">
                    <Heart className="h-3 w-3 fill-[#E50914] text-[#E50914]" />
                    {s.hearts}
                  </span>
                  <span className="w-16 shrink-0 text-right text-lg font-black text-[#E50914]" data-testid="leader-points">
                    {s.points}
                  </span>
                </li>
              ))}
            </ol>
            </>
          ) : status === 'error' ? (
            <p className="px-4 py-8 text-center text-xs leading-relaxed text-neutral-500" data-testid="leaderboard-error">
              Couldn&apos;t load the board just now.
              <button
                onClick={loadBoard}
                className="ml-1 font-bold text-[#E50914] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </p>
          ) : (
            <p className="px-4 py-8 text-center text-xs leading-relaxed text-neutral-500" data-testid="leaderboard-empty">
              {status === 'loading' ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading the board…
                </span>
              ) : (
                <>
                  No applause yet — be the first! Take the Main Seat in your state&apos;s room and
                  let the poppers fly. 🎉
                </>
              )}
            </p>
          )}
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto mt-12 max-w-3xl px-4">
        <h2 className="mb-4 text-lg font-black tracking-tight sm:text-xl">How it works</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { n: '1', t: 'Pick your state', d: 'Auto-detected from your location — or tap any state to roam. Every state has its own hangout room, solo works too.' },
            { n: '2', t: 'Chat, talk, vibe', d: 'Text chat is the heart of every room — turn on your mic & camera whenever you feel like talking. Everything is anonymous.' },
            { n: '3', t: 'Sing when the mood hits 🎤', d: 'One tap starts a Sing Along in any hangout — Main Seat, YouTube karaoke, poppers & hearts for the leaderboard. Or open a dedicated Singing room that lives on stage.' },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <span className="text-3xl font-black text-[#E50914]">{s.n}</span>
              <p className="mt-1.5 text-sm font-bold text-white">{s.t}</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="mt-auto pt-14 text-center">
        <p className="text-[11px] text-neutral-600">
          DesiHangout · Open source (MIT) · WebRTC peer-to-peer — media never touches our servers
        </p>
        <p className="mt-1 text-[11px] text-neutral-700">Be kind. No abusive content. Rooms are moderated by hosts.</p>
      </footer>
    </div>
  )
}
