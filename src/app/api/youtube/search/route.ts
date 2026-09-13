import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * YouTube karaoke search — open-source friendly.
 *
 * Two modes:
 *  1. If YOUTUBE_API_KEY is set (recommended in production — datacenter IPs
 *     often get bot-checked by the scrape path), uses the official YouTube
 *     Data API v3 (free 10,000 units/day ≈ 100 searches/day; search=100 units).
 *  2. Otherwise performs a server-side request to youtube.com/results
 *     (videos-only filter) and parses the embedded ytInitialData payload.
 *     No keys, no quota, works out of the box.
 */

export interface YoutubeResult {
  videoId: string
  title: string
  channel: string
  duration: string
  thumbnail: string
}

interface YtRenderer {
  videoId?: unknown
  title?: { runs?: { text?: unknown }[]; simpleText?: unknown }
  ownerText?: { runs?: { text?: unknown }[] }
  longBylineText?: { runs?: { text?: unknown }[] }
  lengthText?: { simpleText?: unknown }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function collectVideoRenderers(node: unknown, out: YtRenderer[], depth = 0) {
  if (!node || depth > 30 || out.length > 60) return
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (obj.videoRenderer && typeof obj.videoRenderer === 'object') {
    out.push(obj.videoRenderer as YtRenderer)
  }
  for (const value of Object.values(obj)) {
    collectVideoRenderers(value, out, depth + 1)
  }
}

function parseResults(html: string): YoutubeResult[] {
  const match =
    html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/) ||
    html.match(/window\["ytInitialData"\]\s*=\s*(\{[\s\S]*?\});\s*<\/script>/)
  if (!match) return []

  let data: unknown
  try {
    data = JSON.parse(match[1])
  } catch {
    return []
  }

  const renderers: YtRenderer[] = []
  collectVideoRenderers(data, renderers)

  const seen = new Set<string>()
  const results: YoutubeResult[] = []

  for (const r of renderers) {
    const videoId = str(r.videoId)
    if (!videoId || seen.has(videoId)) continue
    const title = str(r.title?.runs?.[0]?.text) || str(r.title?.simpleText) || 'Untitled'
    if (!title || title === '[Private video]' || title === '[Deleted video]') continue

    seen.add(videoId)
    results.push({
      videoId,
      title,
      channel:
        str(r.ownerText?.runs?.[0]?.text) ||
        str(r.longBylineText?.runs?.[0]?.text) ||
        'YouTube',
      duration: str(r.lengthText?.simpleText) || 'live',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    })
    if (results.length >= 20) break
  }
  return results
}

/* ------------------------- official Data API mode ------------------------ */

async function searchViaApi(q: string, apiKey: string): Promise<YoutubeResult[]> {
  const url =
    'https://www.googleapis.com/youtube/v3/search' +
    `?part=snippet&type=video&maxResults=20&videoEmbeddable=true` +
    `&regionCode=IN&hl=en&q=${encodeURIComponent(q)}&key=${apiKey}`
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`YouTube Data API responded ${res.status}${body ? `: ${body.slice(0, 180)}` : ''}`)
  }
  const data = (await res.json()) as {
    items?: {
      id?: { videoId?: unknown }
      snippet?: {
        title?: unknown
        channelTitle?: unknown
        liveBroadcastContent?: unknown
      }
    }[]
  }
  const seen = new Set<string>()
  const results: YoutubeResult[] = []
  for (const item of data.items ?? []) {
    const videoId = str(item.id?.videoId)
    if (!videoId || seen.has(videoId)) continue
    if (item.snippet?.liveBroadcastContent && item.snippet.liveBroadcastContent !== 'none') continue
    seen.add(videoId)
    results.push({
      videoId,
      title: str(item.snippet?.title) || 'Untitled',
      channel: str(item.snippet?.channelTitle) || 'YouTube',
      duration: '—', // search endpoint doesn't return duration; player shows it
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    })
  }
  return results
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 120)
  if (!q) {
    return NextResponse.json(
      { ok: false, results: [], error: 'Type something to search.' },
      { status: 400 },
    )
  }

  try {
    // Mode 1 — official Data API when a key is configured
    const apiKey = process.env.YOUTUBE_API_KEY
    if (apiKey) {
      const results = await searchViaApi(q, apiKey)
      return NextResponse.json({
        ok: true,
        results,
        error: results.length === 0 ? 'No videos found — try another song name.' : null,
      })
    }

    // Mode 2 — keyless scrape
    // sp=EgIQAQ%253D%253D → "Type: Video" filter (skip channels/playlists)
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D&hl=en&gl=IN`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, results: [], error: `YouTube responded ${res.status}` },
        { status: 502 },
      )
    }
    const html = await res.text()
    const results = parseResults(html)
    if (results.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [],
        error: 'No videos found — try another song name.',
      })
    }
    return NextResponse.json({ ok: true, results, error: null })
  } catch (e) {
    console.error('youtube search failed:', e)
    return NextResponse.json(
      { ok: false, results: [], error: 'Search is temporarily unavailable. Try again.' },
      { status: 502 },
    )
  }
}
