'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface LeaderSinger {
  name: string
  state: string
  points: number
  hearts: number
  poppers: number
  performances: number
}

export type BoardStatus = 'loading' | 'ready' | 'error'

const FETCH_TIMEOUT_MS = 8000
const RETRY_DELAYS_MS = [1500, 4000]

/**
 * Loads the Top Singers board with hard guarantees for flaky networks:
 * - every attempt is bounded by an 8 s abort timeout (no eternal spinner)
 * - failed attempts auto-retry with backoff before surfacing an error
 * - an explicit error state + reload() replaces the old fail-silent `catch {}`
 *   that left the board on "Loading…" forever when the API was down
 * - manual reloads keep the previous list visible (stale-while-revalidate)
 */
export function useLeaderboard(state?: string) {
  const [singers, setSingers] = useState<LeaderSinger[] | null>(null)
  const [status, setStatus] = useState<BoardStatus>('loading')
  const runId = useRef(0)
  const hasData = useRef(false)

  useEffect(() => {
    // switching states (lobby) resets the board immediately
    setSingers(null)
    hasData.current = false
    setStatus('loading')
  }, [state])

  const load = useCallback(async () => {
    const id = ++runId.current
    if (!hasData.current) setStatus('loading')

    const query = state ? `?state=${encodeURIComponent(state)}` : ''
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
        const res = await fetch(`/api/leaderboard${query}`, {
          signal: ctl.signal,
          cache: 'no-store',
        }).finally(() => clearTimeout(timer))
        const data = await res.json()
        if (runId.current !== id) return // superseded by a newer load
        if (!res.ok || !data?.ok) throw new Error(`board ${res.status}`)
        hasData.current = true
        setSingers(Array.isArray(data.singers) ? data.singers : [])
        setStatus('ready')
        return
      } catch {
        if (runId.current !== id) return
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
          if (runId.current !== id) return
          continue
        }
        setStatus('error') // keep any previously loaded list on screen
      }
    }
  }, [state])

  useEffect(() => {
    // fetch-then-render; safe to run once per state change
    load()
  }, [load])

  return { singers, status, reload: load }
}
