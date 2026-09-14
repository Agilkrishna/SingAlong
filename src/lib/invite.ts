/**
 * WhatsApp invite helpers — one tap opens WhatsApp with a pre-filled
 * "Join our hangout" message that deep-links straight into the room.
 *
 * Deep-link format:  {origin}/?room=<roomId>&s=<State Name>
 *  - custom rooms:  roomId is the 5-char code (e.g. 7K2MX)
 *  - default rooms: roomId is "state:<slug>" (e.g. state:goa)
 * The `s` param puts the invitee in the right state lobby; for default rooms
 * it also selects the exact state stage.
 */

import { INDIAN_STATES } from './indian-states'

/** `state:madhya-pradesh` → `Madhya Pradesh` (used when an invite omits `s`) */
export function stateFromSlug(slug: string): string | null {
  const needle = slug.toLowerCase().replace(/\s+/g, '-')
  const hit = INDIAN_STATES.find(
    (s) => s.name.toLowerCase().replace(/\s+/g, '-') === needle,
  )
  return hit?.name ?? null
}

export function isDefaultRoomId(roomId: string): boolean {
  return roomId.startsWith('state:')
}

/** the short code humans share for custom rooms */
export function roomDisplayCode(roomId: string): string {
  return isDefaultRoomId(roomId) ? roomId.replace('state:', '').toUpperCase() : roomId.toUpperCase()
}

export interface InviteInfo {
  roomId: string
  roomName: string
  stateName: string
}

/** the exact message WhatsApp opens with — short, punchy, link at the end */
export function buildInviteMessage(info: InviteInfo): string {
  const url = buildInviteUrl(info.roomId, info.stateName)
  const lines = [
    '🎉 You\'re invited to a hangout on DesiHangout!',
    '',
    `💬 ${info.roomName} · ${info.stateName} — chat, jam & Sing Along together`,
  ]
  if (!isDefaultRoomId(info.roomId)) {
    lines.push(`🔑 Room code: ${roomDisplayCode(info.roomId)}`)
  }
  lines.push('', `👉 ${url}`)
  return lines.join('\n')
}

/** absolute deep-link that drops the invitee into this room's join dialog */
export function buildInviteUrl(roomId: string, stateName: string): string {
  if (typeof window === 'undefined') return `/?room=${encodeURIComponent(roomId)}`
  const params = new URLSearchParams({ room: roomId, s: stateName })
  return `${window.location.origin}/?${params.toString()}`
}

/**
 * One tap → WhatsApp share sheet (user picks the chat/group).
 * Returns false when the popup is blocked so the caller can fall back
 * to copying the invite to the clipboard.
 */
export function openWhatsAppInvite(message: string): boolean {
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  return !!win
}
