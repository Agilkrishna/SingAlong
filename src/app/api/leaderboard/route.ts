import { NextRequest, NextResponse } from 'next/server'
import { listSingers } from '@/lib/scores'

export const dynamic = 'force-dynamic'

/**
 * GET /api/leaderboard?state=Maharashtra
 * Top singers by lifetime applause points (popper +10 / heart +100).
 * Without `state` returns the All-India board shown on the home page.
 * Backed by src/lib/scores.ts (atomic JSON file — no native dependencies).
 */
export async function GET(req: NextRequest) {
  try {
    const state = req.nextUrl.searchParams.get('state')?.trim() ?? ''

    const singers = await listSingers(state || undefined)

    return NextResponse.json({
      ok: true,
      state: state || 'All India',
      singers,
    })
  } catch (e) {
    console.error('leaderboard GET failed:', e)
    return NextResponse.json({ ok: false, error: 'failed to load leaderboard' }, { status: 500 })
  }
}
