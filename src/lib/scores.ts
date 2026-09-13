import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Lifetime applause points per anonymous singer — powers the leaderboard.
 *
 * Storage: a single JSON file written atomically (tmp + rename). Chosen over
 * Prisma/SQLite deliberately: Render's free-tier disk is ephemeral anyway, and
 * this removes the native query-engine dependency that made /api/leaderboard
 * fail (eternal "Loading…" on the home board) inside the standalone container.
 * Zero native modules — works identically under `next dev` and `bun server.js`.
 *
 * Concurrency: the Next standalone server is a single process, so the
 * globalThis singleton below is the only writer. Writes are serialized through
 * a promise chain and never block reads; a failed disk write only costs
 * durability, never the in-memory state or the request.
 */

export interface SingerScore {
  name: string
  state: string
  points: number
  poppers: number
  hearts: number
  performances: number
  updatedAt: string
}

interface ScoreFile {
  singers: Record<string, SingerScore>
}

const FILE =
  // start.sh pins SCORES_FILE=/app/db/scores.json in the container; the cwd
  // fallback covers `next dev`. (Do NOT rely on cwd under standalone — bun
  // resolves a relative entrypoint by chdir-ing to the script's directory.)
  process.env.SCORES_FILE || path.join(process.cwd(), 'db', 'scores.json')

/** Hard cap so the file (and memory) can never grow unbounded. */
const MAX_SINGERS = 5000

const globalForScores = globalThis as unknown as {
  __singAlongScores?: { singers: Record<string, SingerScore>; loaded: boolean }
}

const store =
  globalForScores.__singAlongScores ??
  (globalForScores.__singAlongScores = { singers: {}, loaded: false })

/** Serialize all disk writes — one persist runs at a time, in call order. */
let writeChain: Promise<void> = Promise.resolve()

async function load(): Promise<void> {
  if (store.loaded) return
  store.loaded = true
  try {
    const raw = await readFile(FILE, 'utf8')
    const parsed = JSON.parse(raw) as ScoreFile
    if (parsed && typeof parsed.singers === 'object' && parsed.singers) {
      // keep only well-formed entries — a corrupt line must never 500 the board
      for (const [name, s] of Object.entries(parsed.singers)) {
        if (s && typeof s.name === 'string' && name === s.name) {
          store.singers[name] = {
            name: s.name,
            state: typeof s.state === 'string' ? s.state : '',
            points: Number(s.points) || 0,
            poppers: Number(s.poppers) || 0,
            hearts: Number(s.hearts) || 0,
            performances: Number(s.performances) || 0,
            updatedAt:
              typeof s.updatedAt === 'string'
                ? s.updatedAt
                : new Date().toISOString(),
          }
        }
      }
    }
  } catch {
    // first boot / file absent / unreadable → start from an empty board
  }
}

function persist(): Promise<void> {
  writeChain = writeChain.then(async () => {
    try {
      await mkdir(path.dirname(FILE), { recursive: true })
      const tmp = `${FILE}.${process.pid}.tmp`
      await writeFile(tmp, JSON.stringify({ singers: store.singers }), 'utf8')
      await rename(tmp, FILE)
    } catch (e) {
      console.error('scores persist failed:', e)
    }
  })
  return writeChain
}

function prune(): void {
  const names = Object.keys(store.singers)
  if (names.length <= MAX_SINGERS) return
  names
    .sort(
      (a, b) =>
        store.singers[a].points - store.singers[b].points ||
        store.singers[a].updatedAt.localeCompare(store.singers[b].updatedAt),
    )
    .slice(0, names.length - MAX_SINGERS)
    .forEach((n) => delete store.singers[n])
}

export interface PointUpdate {
  name: string
  state: string
  points: number
  poppers: number
  hearts: number
  performances: number
}

/** Incrementally upsert one singer's lifetime totals (same semantics as the previous Prisma upsert). */
export async function upsertSinger(u: PointUpdate): Promise<void> {
  await load()
  const prev =
    store.singers[u.name] ??
    {
      name: u.name,
      state: '',
      points: 0,
      poppers: 0,
      hearts: 0,
      performances: 0,
      updatedAt: new Date(0).toISOString(),
    }
  store.singers[u.name] = {
    name: u.name,
    state: u.state || prev.state,
    points: prev.points + u.points,
    poppers: prev.poppers + u.poppers,
    hearts: prev.hearts + u.hearts,
    performances: prev.performances + u.performances,
    updatedAt: new Date().toISOString(),
  }
  prune()
  await persist()
}

/** Top singers, optionally filtered by state — points desc, hearts desc, recent first. */
export async function listSingers(state?: string): Promise<SingerScore[]> {
  await load()
  const all = Object.values(store.singers).filter(
    (s) => !state || s.state === state,
  )
  return all
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.hearts - a.hearts ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, 20)
    .map((s) => ({ ...s }))
}
