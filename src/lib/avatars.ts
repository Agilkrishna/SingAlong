/**
 * Avatar picker catalog — you're anonymous, but expressive. The emoji rides
 * along with the profile (localStorage) and shows up in chat, the people
 * panel and on video tiles instead of plain initials.
 */

export const AVATARS = [
  '🧑‍🎤',
  '🧕',
  '🧔',
  '👩🏽',
  '🦁',
  '🐯',
  '🦚',
  '🪁',
  '🎸',
  '🛺',
  '☕',
  '🏏',
] as const

export function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? '🧑‍🎤'
}

export function isValidAvatar(a: unknown): a is string {
  return typeof a === 'string' && (AVATARS as readonly string[]).includes(a)
}
