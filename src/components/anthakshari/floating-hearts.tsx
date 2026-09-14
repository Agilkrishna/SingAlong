'use client'

import { useEffect } from 'react'
import { ReactionEvent } from '@/hooks/use-room'

interface FloatingHeartsProps {
  reactions: ReactionEvent[]
  onDone: (id: string) => void
}

const HEARTS = ['❤️', '💖', '💕', '✨', '🧡']

function HeartBurst({ reaction, onDone }: { reaction: ReactionEvent; onDone: (id: string) => void }) {
  // one burst = 4-6 hearts rising from the bottom of the screen
  const parts = Array.from({ length: 4 + Math.floor(Math.random() * 3) }, (_, i) => ({
    emoji: HEARTS[Math.floor(Math.random() * HEARTS.length)],
    left: -90 + Math.random() * 180,
    drift: -50 + Math.random() * 100,
    delay: i * 110 + Math.random() * 80,
    duration: 1400 + Math.random() * 800,
    size: 1.2 + Math.random() * 1.4,
  }))

  useEffect(() => {
    const t = setTimeout(() => onDone(reaction.id), 2300)
    return () => clearTimeout(t)
  }, [reaction.id, onDone])

  return (
    <div className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0" data-testid="heart-burst">
      {parts.map((p, i) => (
        <span
          key={i}
          className="applause-particle absolute whitespace-nowrap"
          style={{
            left: p.left,
            bottom: 12,
            fontSize: `${p.size}rem`,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
            ['--drift' as string]: `${p.drift}px`,
            ['--spin' as string]: '0deg',
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  )
}

/**
 * Floating hearts for EVERY room — hangout, Listen Together, Watch Party.
 * Someone taps the ❤️ FAB, everyone sees hearts float up. Pure fun, no points.
 */
export function FloatingHearts({ reactions, onDone }: FloatingHeartsProps) {
  if (reactions.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" data-testid="hearts-layer">
      {reactions.map((r) => (
        <HeartBurst key={r.id} reaction={r} onDone={onDone} />
      ))}
    </div>
  )
}
