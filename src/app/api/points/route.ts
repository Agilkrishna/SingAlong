import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface PointUpdate {
  name: string
  state: string
  points: number
  poppers: number
  hearts: number
  performances: number
}

const int = (v: unknown) => Math.max(0, Math.round(Number(v) || 0))

/**
 * POST /api/points
 * Called by the realtime service (server-to-server) in small batches.
 * Incrementally upserts lifetime applause points per anonymous singer name —
 * these power the home-page leaderboard.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const updates = Array.isArray(body?.updates) ? body.updates : []

    let count = 0
    for (const u of updates.slice(0, 200)) {
      const name = String(u?.name ?? '').trim().slice(0, 40)
      if (!name) continue

      const points = int(u?.points)
      const poppers = int(u?.poppers)
      const hearts = int(u?.hearts)
      const performances = int(u?.performances)
      const state = String(u?.state ?? '').slice(0, 40)

      await db.singerScore.upsert({
        where: { name },
        create: { name, points, poppers, hearts, performances, state },
        update: {
          points: { increment: points },
          poppers: { increment: poppers },
          hearts: { increment: hearts },
          performances: { increment: performances },
          ...(state ? { state } : {}),
        },
      })
      count += 1
    }

    return NextResponse.json({ ok: true, count })
  } catch (e) {
    console.error('points POST failed:', e)
    return NextResponse.json({ ok: false, error: 'failed to record points' }, { status: 500 })
  }
}
