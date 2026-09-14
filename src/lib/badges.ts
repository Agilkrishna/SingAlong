/**
 * Streaks & badges — light, device-local, zero sign-up (in the spirit of the
 * app: your streak and your badges live in YOUR browser, nothing tracked).
 *
 *  - Streak: consecutive days visiting DesiHangout ("🔥 3-day streak")
 *  - Badges: playful achievements computed/awarded client-side
 *      🦉 Night Owl      — hanging out between midnight and 5 AM
 *      🌅 Early Bird     — first one in before 8 AM
 *      ☕ Chai Champ     — evening hangout (4–7 PM)
 *      👑 Karaoke King   — started a Sing Along
 *      🦋 Social Butterfly — visited 5 different rooms
 */

const STREAK_KEY = 'dh:streak'
const BADGES_KEY = 'dh:badges'
const ROOMS_KEY = 'dh:rooms'

export interface Badge {
  slug: string
  emoji: string
  label: string
}

export const BADGE_CATALOG: Badge[] = [
  { slug: 'night-owl', emoji: '🦉', label: 'Night Owl' },
  { slug: 'early-bird', emoji: '🌅', label: 'Early Bird' },
  { slug: 'chai-champ', emoji: '☕', label: 'Chai Champ' },
  { slug: 'karaoke-king', emoji: '👑', label: 'Karaoke King' },
  { slug: 'social-butterfly', emoji: '🦋', label: 'Social Butterfly' },
]

export interface StreakInfo {
  count: number
  /** true when today's visit extended the streak (toast-worthy) */
  bumped: boolean
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yesterdayKey(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** call once per app load — counts a visit and rolls the daily streak */
export function bumpStreak(): StreakInfo {
  const today = todayKey()
  try {
    const raw = window.localStorage.getItem(STREAK_KEY)
    const prev = raw ? (JSON.parse(raw) as { last?: string; count?: number }) : null
    if (prev?.last === today) return { count: prev.count ?? 1, bumped: false }
    const count = prev?.last === yesterdayKey() ? (prev.count ?? 0) + 1 : 1
    window.localStorage.setItem(STREAK_KEY, JSON.stringify({ last: today, count }))
    return { count, bumped: true }
  } catch {
    return { count: 1, bumped: false }
  }
}

function readBadges(): string[] {
  try {
    const raw = window.localStorage.getItem(BADGES_KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.map(String) : []
  } catch {
    return []
  }
}

function writeBadges(list: string[]) {
  try {
    window.localStorage.setItem(BADGES_KEY, JSON.stringify(list))
  } catch {}
}

/** grant a badge — idempotent; returns true when it's NEW (toast-worthy) */
export function awardBadge(slug: string): boolean {
  const list = readBadges()
  if (list.includes(slug)) return false
  writeBadges([...list, slug])
  return true
}

export function getBadges(): string[] {
  return readBadges()
}

export function badgeInfo(slug: string): Badge | undefined {
  return BADGE_CATALOG.find((b) => b.slug === slug)
}

/** time-of-day badges — evaluated on every app load */
export function awardTimeBadges(): string[] {
  const hour = new Date().getHours()
  const fresh: string[] = []
  const grant = (slug: string) => {
    if (awardBadge(slug)) fresh.push(slug)
  }
  if (hour >= 0 && hour < 5) grant('night-owl')
  else if (hour >= 5 && hour < 8) grant('early-bird')
  else if (hour >= 16 && hour < 19) grant('chai-champ')
  return fresh
}

/** room-visit tracking — powers the Social Butterfly badge */
export function trackRoomVisit(roomId: string): string[] {
  const fresh: string[] = []
  try {
    const raw = window.localStorage.getItem(ROOMS_KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    const rooms = Array.isArray(list) ? list.map(String) : []
    if (!rooms.includes(roomId)) {
      rooms.push(roomId)
      window.localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms.slice(-50)))
      if (rooms.length >= 5 && awardBadge('social-butterfly')) fresh.push('social-butterfly')
    }
  } catch {}
  return fresh
}

/** Karaoke King — awarded when you start a Sing Along */
export function awardKaraokeKing(): string[] {
  return awardBadge('karaoke-king') ? ['karaoke-king'] : []
}

/** render helper — "🔥 3" style emoji+count line for the join dialog */
export function streakLabel(count: number): string {
  if (count >= 2) return `🔥 ${count}-day streak`
  return '🔥 Day 1 — streak started!'
}
