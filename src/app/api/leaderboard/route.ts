import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/leaderboard?state=Maharashtra
 * Top singers by lifetime applause points (popper +10 / heart +100).
 * Without `state` returns the All-India board shown on the home page.
 */
export async function GET(req: NextRequest) {
  try {
    const state = req.nextUrl.searchParams.get('state')?.trim() ?? ''

    const singers = await db.singerScore.findMany({
      where: state ? { state } : undefined,
      orderBy: [{ points: 'desc' }, { hearts: 'desc' }, { updatedAt: 'desc' }],
      take: 20,
    })

    return NextResponse.json({
      ok: true,
      state: state || 'All India',
      singers: singers.map((s) => ({
        name: s.name,
        state: s.state,
        points: s.points,
        poppers: s.poppers,
        hearts: s.hearts,
        performances: s.performances,
        updatedAt: s.updatedAt,
      })),
    })
  } catch (e) {
    console.error('leaderboard GET failed:', e)
    return NextResponse.json({ ok: false, error: 'failed to load leaderboard' }, { status: 500 })
  }
}
