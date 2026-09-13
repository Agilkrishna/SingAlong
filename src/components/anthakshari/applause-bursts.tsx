'use client'

import { useEffect, useMemo } from 'react'
import { ApplauseEvent } from '@/hooks/use-room'

interface ApplauseBurstsProps {
  events: ApplauseEvent[]
  onDone: (id: string) => void
}

interface Particle {
  emoji: string
  label?: string
  left: number // px offset from center
  drift: number // horizontal drift while rising
  delay: number // ms
  duration: number // ms
  size: number // rem
  spin: number // deg
  big: boolean
}

/** build the particle mix for one applause event (popper = shower of "10"s, heart = big +100) */
function particlesFor(ev: ApplauseEvent): Particle[] {
  const rnd = (min: number, max: number) => min + Math.random() * (max - min)
  const parts: Particle[] = []

  if (ev.kind === 'popper') {
    // the classic "10 10 10!" popper shower
    for (let i = 0; i < 4; i++) {
      parts.push({
        emoji: '',
        label: '10',
        left: rnd(-70, 70),
        drift: rnd(-40, 40),
        delay: i * 90,
        duration: rnd(1200, 1700),
        size: rnd(1.1, 1.8),
        spin: rnd(-25, 25),
        big: false,
      })
    }
    for (let i = 0; i < 4; i++) {
      parts.push({
        emoji: '🎉',
        left: rnd(-90, 90),
        drift: rnd(-60, 60),
        delay: rnd(0, 350),
        duration: rnd(1100, 1600),
        size: rnd(1.2, 2),
        spin: rnd(-40, 40),
        big: false,
      })
    }
  } else {
    parts.push({
      emoji: '',
      label: '+100',
      left: rnd(-30, 30),
      drift: rnd(-20, 20),
      delay: 0,
      duration: 1800,
      size: 2.6,
      spin: 0,
      big: true,
    })
    for (let i = 0; i < 3; i++) {
      parts.push({
        emoji: '❤️',
        left: rnd(-90, 90),
        drift: rnd(-50, 50),
        delay: rnd(80, 400),
        duration: rnd(1300, 1900),
        size: rnd(1.4, 2.4),
        spin: rnd(-20, 20),
        big: false,
      })
    }
  }
  return parts
}

function Burst({ event, onDone }: { event: ApplauseEvent; onDone: (id: string) => void }) {
  const particles = useMemo(() => particlesFor(event), [event])

  // auto-dismiss once the animation has played out
  useEffect(() => {
    const t = setTimeout(() => onDone(event.id), 2100)
    return () => clearTimeout(t)
  }, [event.id, onDone])

  return (
    <div className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0" data-testid={`burst-${event.kind}`}>
      {particles.map((p, i) => (
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
            ['--spin' as string]: `${p.spin}deg`,
          }}
        >
          {p.label ? (
            <span
              className={`inline-block rounded-full px-2 py-0.5 font-black shadow-lg ${
                p.big ? 'bg-[#E50914] text-white' : 'bg-[#F5A623] text-black'
              }`}
            >
              {p.label}
            </span>
          ) : (
            <span>{p.emoji}</span>
          )}
        </span>
      ))}
    </div>
  )
}

/**
 * Animated applause overlay — every popper / heart thrown anywhere in the
 * room bursts here ("10 10 10" shower / big +100 heart).
 */
export function ApplauseBursts({ events, onDone }: ApplauseBurstsProps) {
  if (events.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" data-testid="applause-layer">
      {events.map((ev) => (
        <Burst key={ev.id} event={ev} onDone={onDone} />
      ))}
    </div>
  )
}
