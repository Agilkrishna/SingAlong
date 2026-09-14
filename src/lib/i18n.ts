'use client'

/**
 * Tiny EN / Hinglish toggle — DesiHangout keeps it light: no i18n framework,
 * just a dictionary of the most visible strings. Hinglish (Roman script) is
 * deliberate — it is how the app actually talks.
 */

import { useCallback, useEffect, useState } from 'react'

export type Lang = 'en' | 'hi'

const STORAGE_KEY = 'dh:lang'

const DICT: Record<string, { en: string; hi: string }> = {
  // landing
  badge: { en: '100% anonymous · free forever', hi: '100% anonymous · free forever' },
  eyebrow: { en: "India's anonymous hangout rooms", hi: 'India ke anonymous hangout rooms' },
  hero1: { en: 'Hang out with your', hi: 'Apne poore State ke' },
  hero2: { en: 'entire State. Live.', hi: 'saath. Live hangout.' },
  heroSub: {
    en: 'Chat rooms from every corner of India — text, voice & video, 100% anonymous. When the mood hits, one tap starts a Sing Along: YouTube karaoke on the Main Seat, showered with poppers & hearts. No sign-up, no phone number.',
    hi: 'Har kone se chat rooms — text, voice & video, 100% anonymous. Mood ho toh ek tap mein Sing Along: YouTube karaoke, Main Seat, poppers & hearts. Na sign-up, na phone number.',
  },
  useLocation: { en: 'Use my location', hi: 'Meri location lo' },
  finding: { en: 'Finding you…', hi: 'Dhundh rahe hain…' },
  pickState: { en: 'Or pick your state', hi: 'Ya state chuno' },
  roomsNearYou: { en: 'Hangout rooms near', hi: 'Aapke paas ke hangout rooms' },
  you: { en: 'you', hi: 'aap' },
  searchStates: { en: 'Search states…', hi: 'States dhundo…' },
  topSingers: { en: "India's top", hi: "India ke top" },
  singers: { en: 'singers', hi: 'singers' },
  savedNote: {
    en: "— your stage name is saved on this device. Names can't be copied by others inside a room.",
    hi: '— aapka stage name is device par saved hai. Room mein koi aur yeh naam nahi le sakta.',
  },
  freshNote: {
    en: "That's your only identity here — no email, no number, no trace. We'll remember it for your next visit.",
    hi: 'Yahi aapki identity hai — na email, na number, na trace. Hum agle visit ke liye yaad rakhenge.',
  },
  // lobby
  hangoutsTitle: { en: 'Hangouts', hi: 'Hangouts' },
  lobbySub: {
    en: 'Join a live hangout or singing room — or open your own. Text, voice & video with',
    hi: 'Live hangout ya singing room join karo — ya apna kholo. Text, voice & video with',
  },
  allTab: { en: 'All', hi: 'Sab' },
  roomCode: { en: 'ROOM CODE (e.g. 7K2MX)', hi: 'ROOM CODE (e.g. 7K2MX)' },
  stateHangout: { en: 'State hangout', hi: 'State hangout' },
  firstHere: { en: 'Be the first to arrive', hi: 'Sabse pehle aao' },
  hangingOut: { en: 'hanging out now', hi: 'abhi hangout kar rahe hain' },
  liveHere: { en: 'Live in', hi: 'Live in' },
  openOwn: { en: 'Open your own room', hi: 'Apna room kholo' },
  hangoutDesc: {
    en: 'Chat-first room — talk, cams & vibes, Sing Along on tap.',
    hi: 'Chat-first room — baatein, cams & vibes, Sing Along ek tap par.',
  },
  singDesc: {
    en: 'Dedicated singing room — opens with Sing Along live on stage.',
    hi: 'Dedicated singing room — Sing Along live stage ke saath khulta hai.',
  },
  vibesLabel: { en: 'Vibe', hi: 'Vibe' },
  singingEmpty: {
    en: 'No singing rooms live right now — open one below and take the Main Seat first! 🎤',
    hi: 'Abhi koi singing room live nahi — neeche se ek kholo aur Main Seat pehle aap lo! 🎤',
  },
  hangoutEmpty: {
    en: 'right now — the state hangout above is the place to be.',
    hi: 'abhi nahi — upar wala state hangout hi asli jagah hai.',
  },
  noOtherHangouts: { en: 'No other hangouts in', hi: 'Aur koi hangout nahi' },
  topSingersBox: { en: 'Top Singers ·', hi: 'Top Singers ·' },
  // room
  icebreaker: { en: "Today's icebreaker", hi: 'Aaj ka icebreaker' },
  singLive: { en: 'Sing Along live — Main Seat & karaoke open', hi: 'Sing Along live — Main Seat & karaoke khula hai' },
  listenLive: { en: 'Listen Together live — queue a track from the karaoke panel', hi: 'Listen Together live — karaoke panel se track lagao' },
  watchLive: { en: 'Watch Party live — play a video from the karaoke panel', hi: 'Watch Party live — karaoke panel se video chalao' },
  end: { en: 'End', hi: 'Khatam' },
  dataSaverOn: { en: 'Data Saver on', hi: 'Data Saver on' },
  dataSaverOff: { en: 'Data Saver off', hi: 'Data Saver off' },
  people: { en: 'People', hi: 'Log' },
  heart: { en: 'Send love', hi: 'Pyar bhejo' },
  // batch B — games, scheduling, recap
  games: { en: 'Games', hi: 'Games' },
  quizTab: { en: '🎲 Quiz', hi: '🎲 Quiz' },
  truthTab: { en: '💬 Truth or Dare', hi: '💬 Sach ya Jhooth' },
  rapidTab: { en: '⚡ Rapid-fire', hi: '⚡ Rapid-fire' },
  quizStart: { en: 'Start a quiz — 5 questions, 15s each', hi: 'Quiz shuru karo — 5 sawaal, 15 sec' },
  quizLive: { en: 'Quiz live', hi: 'Quiz live' },
  gamesOpen: { en: 'Party games', hi: 'Party games' },
  startingSoon: { en: 'Starting soon', hi: 'Jald aa raha hai' },
  scheduleFor: { en: 'Schedule for later (optional)', hi: 'Baad ke liye schedule (optional)' },
  passcodeLabel: { en: 'Passcode (optional 4-8 digits)', hi: 'Passcode (4-8 digit, optional)' },
  enterPasscode: { en: 'Room passcode', hi: 'Room ka passcode' },
  lockedRoom: { en: '🔒 Locked', hi: '🔒 Locked' },
  remindMe: { en: '🔔 Remind me', hi: '🔔 Yaad dilao' },
  recapTitle: { en: 'Session recap', hi: 'Session recap' },
  shareRecap: { en: 'Share on WhatsApp', hi: 'WhatsApp par bhejo' },
  vibesWithYou: { en: 'Vibe', hi: 'Vibe' },
  vibeFriendsHere: { en: 'Vibe friends here', hi: 'Vibe friends yahan hain' },
}

export function tFor(lang: Lang, key: keyof typeof DICT): string {
  const e = DICT[key]
  if (!e) return String(key)
  return lang === 'hi' ? e.hi : e.en
}

/** Global language state — one provider-less hook (all views share the key). */
export function useLang() {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === 'hi' || saved === 'en') setLangState(saved)
    } catch {}
  }, [])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  }, [])

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next: Lang = prev === 'en' ? 'hi' : 'en'
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {}
      return next
    })
  }, [])

  const t = useCallback((key: keyof typeof DICT) => tFor(lang, key), [lang])

  return { lang, setLang, toggleLang, t }
}
