/**
 * "Vibed with you" — an opt-in, phone-number-free way to remember people you
 * clicked with. Tapping 🔖 Vibe on someone saves their display name + avatar
 * on YOUR device only. Next time you land in a room together, DesiHangout
 * celebrates the reunion. No servers, no tracking, unblock anytime.
 */

const KEY = 'dh:vibes'

export interface VibeFriend {
  name: string
  avatar?: string
  at: number
}

export function getVibeFriends(): VibeFriend[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list
      .map((v) => ({
        name: String((v as VibeFriend)?.name ?? ''),
        avatar: typeof (v as VibeFriend)?.avatar === 'string' ? (v as VibeFriend).avatar : undefined,
        at: Number((v as VibeFriend)?.at) || 0,
      }))
      .filter((v) => v.name)
  } catch {
    return []
  }
}

function write(list: VibeFriend[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100)))
  } catch {}
}

/** returns true when this person was newly saved (toast-worthy) */
export function addVibeFriend(name: string, avatar?: string): boolean {
  const key = name.trim().toLowerCase()
  if (!key) return false
  const list = getVibeFriends()
  if (list.some((v) => v.name.toLowerCase() === key)) return false
  write([{ name: name.trim(), avatar, at: Date.now() }, ...list])
  return true
}

export function removeVibeFriend(name: string) {
  const key = name.trim().toLowerCase()
  write(getVibeFriends().filter((v) => v.name.toLowerCase() !== key))
}

export function isVibeFriend(name: string): boolean {
  const key = name.trim().toLowerCase()
  return getVibeFriends().some((v) => v.name.toLowerCase() === key)
}

/** which of your vibe friends are in this room right now? */
export function matchVibeFriends(names: string[]): VibeFriend[] {
  const keys = new Set(names.map((n) => n.trim().toLowerCase()))
  return getVibeFriends().filter((v) => keys.has(v.name.toLowerCase()))
}
