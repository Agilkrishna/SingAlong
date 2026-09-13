import { NextRequest, NextResponse } from 'next/server'
import { upsertSinger } from '@/lib/scores'

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
 * Backed by src/lib/scores.ts (atomic JSON file — no native dependencies).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const updates = Array.isArray(body?.updates) ? body.updates : []

    let count = 0
    for (const u of updates.slice(0, 200)) {
      const name = String(u?.name ?? '').trim().slice(0, 40)
      if (!name) continue

      await upsertSinger({
        name,
        state: String(u?.state ?? '').slice(0, 40),
        points: int(u?.points),
        poppers: int(u?.poppers),
        hearts: int(u?.hearts),
        performances: int(u?.performances),
      })
      count += 1
    }

    return NextResponse.json({ ok: true, count })
  } catch (e) {
    console.error('points POST failed:', e)
    return NextResponse.json({ ok: false, error: 'failed to record points' }, { status: 500 })
  }
}
