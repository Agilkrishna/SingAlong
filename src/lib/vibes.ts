/**
 * Vibe tags — the fixed room-culture catalog.
 * Slugs travel over the wire; the client maps them to labels/emoji.
 */

export interface Vibe {
  slug: string
  emoji: string
  label: string
}

export const VIBES: Vibe[] = [
  { slug: 'chai-time', emoji: '☕', label: 'Chai Time' },
  { slug: 'late-night', emoji: '🌙', label: 'Late Night' },
  { slug: 'retro', emoji: '📻', label: 'Retro' },
  { slug: 'devotional', emoji: '🪔', label: 'Devotional' },
  { slug: 'movies', emoji: '🎬', label: 'Movies' },
  { slug: 'gupshup', emoji: '💬', label: 'Gupshup' },
]

const bySlug = new Map(VIBES.map((v) => [v.slug, v]))

export function vibeOf(slug: string): Vibe | undefined {
  return bySlug.get(slug)
}

/** 'retro' → '📻 Retro' · unknown slugs render as-is */
export function vibeLabel(slug: string): string {
  const v = bySlug.get(slug)
  return v ? `${v.emoji} ${v.label}` : slug
}

export function isVibe(slug: string): boolean {
  return bySlug.has(slug)
}
