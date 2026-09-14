/**
 * DesiHangout — Realtime Service
 * -----------------------------
 * Socket.io mini-service (port 3003) handling:
 *  - State-based hangout rooms (location rooms for every Indian State / UT)
 *  - Anonymous profiles with persistent ids + unique-name enforcement
 *  - WebRTC mesh signaling relay (offer / answer / ICE)
 *  - Hangout-first model: chat is the main surface of every room, and
 *    activities (Sing Along / Listen Together / Watch Party) any participant
 *    starts/ends with one tap — the whole room flips layouts together.
 *  - Vibe tags on custom rooms + a daily icebreaker prompt per room
 *  - Host controls (host-enforced mute, remove) · room reports
 *  - Floating-heart reactions in every room (hangout & media activities)
 *  - Party games: live trivia quiz, Truth-or-Dare & Rapid-fire prompts,
 *    and the classic Antakshari letter game (inside the Sing Along activity)
 *  - Passcode-locked private rooms · scheduled rooms ("tonight 9 PM")
 *  - Network-blip resilience: a dropped socket keeps the seat for a grace
 *    period and a rejoining client silently resumes it (auto-rejoin)
 *  - The "Main Seat" (inside the Sing Along activity): one singer performs,
 *    everyone else cheers them with animated poppers (+10 pts) and hearts
 *    (+100 pts) — no rounds, no competition, just a jam room.
 *  - Shared YouTube karaoke player state (load / play / pause / seek / queue)
 *  - Room chat
 *
 * Live state is kept in memory. Applause points are batched (3s) and POSTed
 * to the Next.js API (port 3000) which persists them with Prisma for the
 * home-page leaderboard.
 */

import { createServer } from 'http'
import { randomUUID } from 'node:crypto'
import { Server, Socket } from 'socket.io'

const PORT = 3003
const MAX_PARTICIPANTS = 8
const CHAT_HISTORY = 60
const MAX_KARAOKE_QUEUE = 30
const AWARD_COOLDOWN_MS = 600
const POINTS_FLUSH_MS = 3000

const POPPER_POINTS = 10
const HEART_POINTS = 100

/** a dropped socket keeps its seat this long before being removed */
const REJOIN_GRACE_MS = 15_000
/** party games sizing */
const QUIZ_ROUNDS = 5
const QUIZ_ANSWER_MS = 15_000
const QUIZ_REVEAL_MS = 4_500
const ANTAK_TURN_MS = 45_000
/** a room can only be scheduled within the next 7 days */
const MAX_SCHEDULE_MS = 7 * 24 * 60 * 60 * 1000

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

/* ---------------------------------- types --------------------------------- */

interface Profile {
  name: string
  color: string
  /** optional emoji avatar picked in the join dialog ("🛺") */
  avatar?: string
}

interface Participant {
  id: string
  /** stable anonymous id stored in the user's browser (localStorage) */
  pid: string
  name: string
  color: string
  /** optional emoji avatar picked in the join dialog */
  avatar?: string
  micOn: boolean
  camOn: boolean
  isHost: boolean
  joinedAt: number
  /** host-enforced mute — the service rejects their mic-on media-state */
  forcedMuted?: boolean
  /** socket dropped but the grace window is still holding their seat */
  disconnected?: boolean
}

interface ChatMessage {
  id: string
  type: 'user' | 'system'
  from?: string
  name?: string
  color?: string
  avatar?: string
  text: string
  at: number
}

interface Stage {
  singerId: string
  singerName: string
  singerColor: string
  since: number
  /** applause points earned during this seat session */
  points: number
  poppers: number
  hearts: number
}

interface QueueItem {
  videoId: string
  title: string
  by: string
  byName: string
}

interface Karaoke {
  videoId: string
  title: string
  playing: boolean
  positionAt: number
  updatedAt: number
  by: string
  byName: string
  queue: QueueItem[]
}

interface QuizQ {
  q: string
  o: [string, string, string, string]
  a: number
}

interface QuizState {
  questions: QuizQ[]
  index: number
  phase: 'question' | 'reveal'
  endsAt: number
  answers: Record<string, { choice: number; at: number; name: string }>
  scores: Record<string, number>
  byName: string
}

interface PromptsState {
  mode: 'truth' | 'dare' | 'rapid'
  text: string
  target: string
  byName: string
  at: number
}

interface AntakshariState {
  players: string[]
  turnIdx: number
  letter: string
  scores: Record<string, number>
  endsAt: number
  byName: string
}

interface Room {
  id: string
  name: string
  state: string
  hostId: string
  createdAt: number
  isDefault: boolean
  /** optional 4-8 digit lock — private family/friend rooms */
  passcode?: string
  /** epoch ms — scheduled rooms show up in the lobby as "Starting soon" */
  scheduleAt?: number
  /** what this room IS — 'hangout' (chat-first, default) or 'sing'
   *  (a dedicated singing room, shown with a 🎤 badge in the lobby) */
  kind: 'hangout' | 'sing'
  /** what is running RIGHT NOW — 'chat' = hangout layout ·
   *  'sing' = Sing Along activity (stage + Main Seat + karaoke) ·
   *  'listen' = Listen Together (shared YouTube music, chat stays open) ·
   *  'watch' = Watch Party (shared YouTube video, chat stays open) */
  activity: 'chat' | 'sing' | 'listen' | 'watch'
  /** vibe tags chosen at creation — validated against VIBES */
  tags: string[]
  /** number of abuse reports received (logged, not broadcast) */
  reports: number
  participants: Map<string, Participant>
  stage: Stage | null
  chat: ChatMessage[]
  karaoke: Karaoke | null
  karaokeEndedAt: number
  /** live trivia quiz (party game, independent of the room activity) */
  quiz: QuizState | null
  /** Truth-or-Dare / Rapid-fire prompt card */
  prompts: PromptsState | null
  /** classic Antakshari letter game (Sing Along activity only) */
  antakshari: AntakshariState | null
  /** when the last singer left — empty custom rooms linger for a grace period */
  emptyAt?: number
}

interface JoinPayload {
  roomId: string
  state: string
  profile: Profile
  pid: string
  micOn: boolean
  camOn: boolean
  /** required when the room is passcode-locked */
  passcode?: string
}

interface ApplauseEvent {
  id: string
  kind: 'popper' | 'heart'
  points: number
  by: string
  byName: string
  singerId: string
  singerName: string
  stage: { points: number; poppers: number; hearts: number }
  at: number
}

/* -------------------------------- helpers --------------------------------- */

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomCode = (len = 5) =>
  Array.from({ length: len }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')

// crypto-unique ids: React uses these as list keys, so even one collision is
// visible to users ("Encountered two children with the same key")
const msgId = () => randomUUID()

const AVATAR_COLORS = ['#E50914', '#F5A623', '#2ECC71', '#1ABC9C', '#9B59B6', '#E91E63', '#F39C12', '#00BCD4', '#8BC34A', '#FF5722']

/* ------------------------- vibe tags (room culture) ----------------------- */

const VIBES: Record<string, string> = {
  'chai-time': '☕ Chai Time',
  'late-night': '🌙 Late Night',
  retro: '📻 Retro',
  devotional: '🪔 Devotional',
  movies: '🎬 Movies',
  gupshup: '💬 Gupshup',
}

function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(
    new Set(
      raw
        .map((t) => String(t).trim().toLowerCase())
        .filter((t) => t in VIBES)
        .slice(0, 3),
    ),
  )
}

/* ---------------------- daily icebreaker prompts -------------------------- */

const ICEBREAKERS = [
  'Intro time — name, city, and your go-to chai order ☕',
  'One Bollywood song that ALWAYS fills the dance floor?',
  'Cricket fan? Best match you have ever watched live? 🏏',
  'The one street food you would defend with your life? 🍽️',
  'Monsoon memories — best thing to do when it pours? 🌧️',
  'Recommend one movie everyone here should watch 🎬',
  'Your city\u2019s most underrated spot — GO! 📍',
  'What are you snacking on right now? 😄',
  'One song you have been replaying this week 🎧',
  'Weekend plans — sleeping in or exploring? 🛌',
  'Describe your day in 3 emojis 😎',
  'Who is your comfort Bollywood actor? 🎭',
  'Which festival are you most excited about this year? 🪔',
  'Tell us one fun fact about your hometown 🏡',
  'What is playing in your headphones right now? 🎵',
  'Best dhaba or chaat place near you? 🛣️',
  'If today had a Bollywood title, what would it be? 🎬',
  'Coffee, chai or lassi — pick your champion ☕🥤',
  'One talent you wish you had? ✨',
  'How many hours did you actually sleep last night? 🌙',
  'Which language songs do you vibe with most? 🎶',
  'Your all-time favourite Arijit or Sonu song? 🎤',
  'The last meme you sent in the family group? 😂',
  'Rain + chai + pakoras — yes or yes? 🌧️',
]

/** deterministic per room + day — everyone in the room sees the same prompt */
function roomPrompt(room: Room): string {
  const day = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC days are fine for a prompt)
  let h = 0
  const key = `${day}:${room.id}`
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return ICEBREAKERS[h % ICEBREAKERS.length] ?? ICEBREAKERS[0]!
}

const rooms = new Map<string, Room>()

/** random other participant for prompt games (falls back to the spinner) */
function pickTarget(room: Room, excludeName: string): string {
  const others = Array.from(room.participants.values())
    .map((p) => p.name)
    .filter((n) => n !== excludeName)
  return others.length > 0 ? pick(others) : excludeName
}

/** advance to the next Antakshari player who is actually still in the room */
function nextAntakTurn(game: AntakshariState, room: Room): number {
  const here = new Set(Array.from(room.participants.values()).map((p) => p.name))
  for (let step = 1; step <= game.players.length; step++) {
    const idx = (game.turnIdx + step) % game.players.length
    if (here.has(game.players[idx]!)) return idx
  }
  return game.turnIdx
}

function scheduleQuizTick(roomId: string, delay: number) {
  const prev = quizTimers.get(roomId)
  if (prev) clearTimeout(prev)
  quizTimers.set(
    roomId,
    setTimeout(() => {
      quizTimers.delete(roomId)
      quizTick(roomId)
    }, delay),
  )
}

/** question expiry → reveal → next question → … → final scores */
function quizTick(roomId: string) {
  const room = rooms.get(roomId)
  const quiz = room?.quiz
  if (!room || !quiz) return
  if (quiz.phase === 'question') {
    const q = quiz.questions[quiz.index]
    if (!q) return
    const correct = Object.values(quiz.answers).filter((v) => v.choice === q.a)
    correct.forEach((v, i) => {
      quiz.scores[v.name] = (quiz.scores[v.name] ?? 0) + (i === 0 ? 100 : 50)
    })
    quiz.phase = 'reveal'
    quiz.endsAt = Date.now() + QUIZ_REVEAL_MS
    const winners = correct.map((v) => v.name)
    const m = sysMsg(
      room,
      `✅ Correct: ${q.o[q.a]}${winners.length ? ` — ${winners.join(', ')} nailed it!` : ' — nobody got it 😅'}`,
    )
    io.to(room.id).emit('chat', { message: m })
    broadcastRoom(room)
    scheduleQuizTick(roomId, QUIZ_REVEAL_MS)
  } else {
    if (quiz.index + 1 >= quiz.questions.length) {
      const board = Object.entries(quiz.scores)
        .sort((a, b) => b[1] - a[1])
        .map(([name, pts], i) => `${i + 1}. ${name} — ${pts}`)
        .join(' · ')
      const winner = Object.entries(quiz.scores).sort((a, b) => b[1] - a[1])[0]?.[0]
      const m = sysMsg(
        room,
        `🏆 Quiz over! ${winner ? `${winner} wins the quiz! ` : ''}${board || 'No points scored.'}`,
      )
      io.to(room.id).emit('chat', { message: m })
      room.quiz = null
    } else {
      quiz.index += 1
      quiz.phase = 'question'
      quiz.answers = {}
      quiz.endsAt = Date.now() + QUIZ_ANSWER_MS
    }
    broadcastRoom(room)
    if (room.quiz) scheduleQuizTick(roomId, QUIZ_ANSWER_MS)
  }
}

function scheduleAntakTick(roomId: string, delay: number) {
  const prev = antakTimers.get(roomId)
  if (prev) clearTimeout(prev)
  antakTimers.set(
    roomId,
    setTimeout(() => {
      antakTimers.delete(roomId)
      antakTick(roomId)
    }, delay),
  )
}

/** turn timer expired — skip the singer, the letter stays (classic rule) */
function antakTick(roomId: string) {
  const room = rooms.get(roomId)
  const game = room?.antakshari
  if (!room || !game) return
  const missed = game.players[game.turnIdx]
  game.turnIdx = nextAntakTurn(game, room)
  game.endsAt = Date.now() + ANTAK_TURN_MS
  const next = game.players[game.turnIdx]
  const m = sysMsg(
    room,
    `⏰ Time's up for ${missed}! ${next}, sing a song with "${game.letter}" — the letter stays.`,
  )
  io.to(room.id).emit('chat', { message: m })
  broadcastRoom(room)
  scheduleAntakTick(roomId, ANTAK_TURN_MS)
}

/**
 * Remove a participant for good — explicit leave, host-remove, or a socket
 * whose rejoin grace expired. Frees the Main Seat, reassigns the host, parks
 * the room when it empties, and tears down any running party games.
 */
function removeParticipant(room: Room, socketId: string, verb: 'left the stage' | 'lost connection') {
  const me = room.participants.get(socketId)
  if (!me) return
  room.participants.delete(socketId)
  const m = sysMsg(room, `${me.name} ${verb}`)
  io.to(room.id).emit('chat', { message: m })
  io.to(room.id).emit('participant-left', { id: socketId, name: me.name })

  // if the singer leaves, the Main Seat opens up again
  if (room.stage && room.stage.singerId === socketId) {
    room.stage = null
    const s = sysMsg(room, `🎤 ${me.name} stepped down — the Main Seat is free`)
    io.to(room.id).emit('chat', { message: s })
  }

  // reassign host
  if (room.hostId === socketId) {
    const next = Array.from(room.participants.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0]
    room.hostId = next?.id ?? ''
    if (next) next.isHost = true
    if (next) sysMsg(room, `${next.name} is now the host`)
  }

  if (room.participants.size === 0) {
    // park the room for the next arrival (a WhatsApp invitee, or the same
    // person after a refresh): hangouts re-open chat-first; dedicated
    // singing rooms keep their identity and open on the stage again.
    room.activity = room.kind === 'sing' ? 'sing' : 'chat'
    room.stage = null
    room.karaoke = null
    clearRoomGames(room)
    if (!room.isDefault) {
      // keep the room alive for a grace period — a WhatsApp invite must
      // survive the creator closing the tab / locking their phone, and a
      // page refresh must not wipe the room out from under the singer.
      // A sweeper deletes truly abandoned rooms after EMPTY_ROOM_TTL_MS.
      room.emptyAt = Date.now()
    }
  } else {
    broadcastRoom(room)
  }
}

/* --------------------------- party game content --------------------------- */

const QUIZ_QUESTIONS: QuizQ[] = [
  { q: "Which movie features the song 'Kajra Re'?", o: ['Bunty Aur Babli', 'DDLJ', 'Don', 'Om Shanti Om'], a: 0 },
  { q: 'How many players from one cricket team are on the field?', o: ['9', '10', '11', '12'], a: 2 },
  { q: 'Which city is called the Pink City?', o: ['Jodhpur', 'Jaipur', 'Udaipur', 'Bikaner'], a: 1 },
  { q: "'Bhaijaan' is the nickname of which actor?", o: ['Salman Khan', 'SRK', 'Aamir Khan', 'Akshay Kumar'], a: 0 },
  { q: "What is India's national fruit?", o: ['Mango', 'Banana', 'Apple', 'Papaya'], a: 0 },
  { q: 'Kolkata was formerly known as?', o: ['Madras', 'Bombay', 'Calcutta', 'Poona'], a: 2 },
  { q: 'Which festival is called the festival of lights?', o: ['Holi', 'Diwali', 'Eid', 'Onam'], a: 1 },
  { q: 'Who is called the God of Cricket?', o: ['Virat Kohli', 'Sachin Tendulkar', 'MS Dhoni', 'Kapil Dev'], a: 1 },
  { q: 'Which river is considered the holiest in Hinduism?', o: ['Yamuna', 'Godavari', 'Ganga', 'Narmada'], a: 2 },
  { q: "Shah Rukh Khan's debut film was?", o: ['Deewana', 'Baazigar', 'Darr', 'Dilwale'], a: 0 },
  { q: 'Which IPL team is based in Chennai?', o: ['RCB', 'MI', 'CSK', 'KKR'], a: 2 },
  { q: 'Which state is famous for its backwaters?', o: ['Gujarat', 'Kerala', 'Goa', 'Odisha'], a: 1 },
  { q: "'Dil Chahta Hai' released in?", o: ['1999', '2001', '2003', '2005'], a: 1 },
  { q: 'Which is the smallest Indian state by area?', o: ['Sikkim', 'Goa', 'Tripura', 'Manipur'], a: 1 },
  { q: "Arijit Singh's breakthrough song?", o: ['Tum Hi Ho', 'Channa Mereya', 'Kesariya', 'Raabta'], a: 0 },
  { q: 'How many states does India have?', o: ['27', '28', '29', '30'], a: 1 },
  { q: 'Kathakali dance comes from which state?', o: ['Tamil Nadu', 'Kerala', 'Odisha', 'Punjab'], a: 1 },
  { q: "Virat Kohli plays IPL for?", o: ['Mumbai Indians', 'RCB', 'CSK', 'Delhi Capitals'], a: 1 },
  { q: 'Lassi is made from?', o: ['Milk', 'Curd', 'Paneer', 'Ghee'], a: 1 },
  { q: 'The Taj Mahal is in?', o: ['Delhi', 'Jaipur', 'Agra', 'Lucknow'], a: 2 },
  { q: "SRK's home production company?", o: ['Dharma Productions', 'Red Chillies', 'YRF', 'T-Series'], a: 1 },
  { q: 'Which sport is India traditionally famous for (besides cricket)?', o: ['Hockey', 'Golf', 'Tennis', 'Badminton'], a: 0 },
  { q: "'Howdy Modi' — which PM attended with Modi in Houston?", o: ['Obama', 'Trump', 'Biden', 'Cameron'], a: 1 },
  { q: 'Butter chicken was born in?', o: ['Delhi', 'Lucknow', 'Amritsar', 'Hyderabad'], a: 0 },
]

const TRUTHS = [
  'What is the most embarrassing song on your playlist? 🙈',
  'Who was your first celebrity crush?',
  'What is one weird food combo you secretly love?',
  'Tell us about your most awkward school moment 😅',
  'What is the last thing you searched on your phone?',
  'Which app do you waste the most time on — be honest?',
  'What is one lie you told your parents that worked?',
  'If you could swap lives with anyone here for a day, who and why?',
  'What is your most irrational fear?',
  'Have you ever cried during a movie? Which one?',
  'What is the pettiest reason you ever got angry?',
  'Show us the last photo in your gallery (safe ones only!) 📸',
  'What is one talent you pretend to have?',
  'Who was your childhood hero — and are they still?',
]

const DARES = [
  'Sing your favourite chorus in FULL filmy style — no music! 🎤',
  'Talk only in Bollywood dialogues for the next 2 minutes 🎬',
  'Do your best Desi wedding dance move right now 💃',
  'Sing a song but every word must rhyme with "chai" ☕',
  'Give a dramatic filmy entrance like a 90s villain 😈',
  'Compliment everyone in the room — one line each, no repeats!',
  'Speak in the voice of a strict school teacher for 1 minute',
  'Hum a song and let others guess — no words allowed! 🎵',
  'Announce your arrival like a stadium commentator 🏟️',
  'Say the alphabet backwards as far as you can in 20 seconds',
  'Do 10 jumping jacks while singing the national-anthem-style intro of any song',
  'Narrate your day like a breaking-news reporter 📰',
  'Imitate a family member on a typical phone call 📞',
  'Give an award-acceptance speech thanking chai and your WiFi ☕',
]

const RAPID = [
  'Name 3 Shah Rukh Khan movies in 10 seconds! ⚡',
  '5 Indian states — GO! 🗺️',
  '3 songs by Arijit Singh — now! 🎧',
  'Name 4 street foods in 10 seconds 🍽️',
  '3 cricketers who captained India 🏏',
  'Name 5 Bollywood dance songs 🔥',
  '4 languages spoken in India — quick! 🗣️',
  '3 Aamir Khan films — clock is ticking ⏱️',
  'Name 4 festival names in 10 seconds 🪔',
  '5 things found in every Indian wedding 💐',
  '3 classical dance forms 🩰',
  'Name 4 Indian rivers in 10 seconds 🌊',
]

const ANTAKSHARI_LETTERS = ['A', 'B', 'D', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'Y']

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!

const rejoinTimers = new Map<string, ReturnType<typeof setTimeout>>() // keyed by pid
const quizTimers = new Map<string, ReturnType<typeof setTimeout>>() // keyed by room id
const antakTimers = new Map<string, ReturnType<typeof setTimeout>>() // keyed by room id

/** each state always has one featured "always-on" room */
const defaultRoomId = (state: string) => `state:${state.toLowerCase().replace(/\s+/g, '-')}`

function ensureDefaultRoom(state: string): Room {
  const id = defaultRoomId(state)
  let room = rooms.get(id)
  if (!room) {
    room = {
      id,
      name: `${state} Hangout`,
      state,
      hostId: '',
      createdAt: Date.now(),
      isDefault: true,
      participants: new Map(),
      ...defaultRoomObjects(),
    }
    // state rooms are always general hangouts (Sing Along available on tap)
    room.kind = 'hangout'
    rooms.set(id, room)
  }
  return room
}

function publicRoom(room: Room) {
  return {
    id: room.id,
    name: room.name,
    state: room.state,
    count: room.participants.size,
    live: !!room.stage,
    isDefault: room.isDefault,
    kind: room.kind,
    tags: room.tags,
    // never leak the passcode itself — just whether the door is locked
    locked: !!room.passcode,
    scheduleAt: room.scheduleAt,
  }
}

function roomSnapshot(room: Room) {
  return {
    id: room.id,
    name: room.name,
    state: room.state,
    hostId: room.hostId,
    kind: room.kind,
    activity: room.activity,
    tags: room.tags,
    prompt: roomPrompt(room),
    participants: Array.from(room.participants.values())
      .sort((a, b) => a.joinedAt - b.joinedAt)
      // pid never leaves the server — it is only used for rejoin matching
      .map(({ pid, ...p }) => p),
    stage: room.stage,
    chat: room.chat.slice(-CHAT_HISTORY),
    karaoke: room.karaoke,
    quiz: publicQuiz(room.quiz),
    prompts: room.prompts,
    antakshari: room.antakshari,
    scheduleAt: room.scheduleAt,
  }
}

/**
 * Single choke-point for writing to room.chat — guarantees no message id ever
 * lands twice (duplicate ids would render duplicate React keys in chat).
 */
function pushChat(room: Room, m: ChatMessage) {
  if (room.chat.some((c) => c.id === m.id)) return
  room.chat.push(m)
  if (room.chat.length > CHAT_HISTORY * 2) room.chat = room.chat.slice(-CHAT_HISTORY)
}

function sysMsg(room: Room, text: string) {
  const m: ChatMessage = { id: msgId(), type: 'system', text, at: Date.now() }
  pushChat(room, m)
  return m
}

function broadcastRoom(room: Room) {
  io.to(room.id).emit('room-state', { room: roomSnapshot(room) })
}

function broadcastKaraoke(room: Room) {
  if (!room.karaoke) return
  io.to(room.id).emit('karaoke-state', {
    karaoke: { ...room.karaoke, serverNow: Date.now() },
  })
}

const validVideoId = (id: string) => /^[\w-]{6,24}$/.test(id)

function defaultRoomObjects() {
  return {
    kind: 'hangout' as 'hangout' | 'sing',
    stage: null as Stage | null,
    chat: [] as ChatMessage[],
    karaoke: null as Karaoke | null,
    karaokeEndedAt: 0,
    activity: 'chat' as Room['activity'],
    tags: [] as string[],
    reports: 0,
    quiz: null as QuizState | null,
    prompts: null as PromptsState | null,
    antakshari: null as AntakshariState | null,
  }
}

/** the client-facing quiz view — never leaks the correct answer mid-question */
function publicQuiz(quiz: QuizState | null) {
  if (!quiz) return null
  const q = quiz.questions[quiz.index]
  if (!q) return null
  return {
    phase: quiz.phase,
    index: quiz.index,
    total: quiz.questions.length,
    q: q.q,
    options: q.o,
    endsAt: quiz.endsAt,
    answersCount: Object.keys(quiz.answers).length,
    scores: quiz.scores,
    byName: quiz.byName,
    ...(quiz.phase === 'reveal'
      ? {
          correct: q.a,
          gotIt: Object.values(quiz.answers)
            .filter((v) => v.choice === q.a)
            .map((v) => v.name),
        }
      : {}),
  }
}

function clearRoomGames(room: Room) {
  room.quiz = null
  room.prompts = null
  room.antakshari = null
  const q = quizTimers.get(room.id)
  if (q) clearTimeout(q)
  quizTimers.delete(room.id)
  const a = antakTimers.get(room.id)
  if (a) clearTimeout(a)
  antakTimers.delete(room.id)
}

function roomListForState(state: string) {
  const now = Date.now()
  const list = Array.from(rooms.values()).filter(
    (r) =>
      r.state.toLowerCase() === state.toLowerCase() &&
      // occupied rooms + upcoming scheduled rooms ("Starting soon") are listed
      (r.participants.size > 0 || (r.scheduleAt ?? 0) > now),
  )
  const def = ensureDefaultRoom(state)
  if (!list.find((r) => r.id === def.id)) list.unshift(def)
  return list.map(publicRoom)
}

/* ------------------------- leaderboard point queue ------------------------ */

interface PendingScore {
  name: string
  state: string
  points: number
  poppers: number
  hearts: number
  performances: number
}

const pendingScores = new Map<string, PendingScore>()

function queueScore(
  name: string,
  state: string,
  delta: { points?: number; poppers?: number; hearts?: number; performances?: number },
) {
  const key = name.toLowerCase()
  const cur =
    pendingScores.get(key) ?? { name, state, points: 0, poppers: 0, hearts: 0, performances: 0 }
  cur.points += delta.points ?? 0
  cur.poppers += delta.poppers ?? 0
  cur.hearts += delta.hearts ?? 0
  cur.performances += delta.performances ?? 0
  if (state) cur.state = state
  pendingScores.set(key, cur)
}

function flushScores() {
  if (pendingScores.size === 0) return
  const updates = Array.from(pendingScores.values()).filter(
    (u) => u.points || u.poppers || u.hearts || u.performances,
  )
  pendingScores.clear()
  if (!updates.length) return

  fetch('http://localhost:3000/api/points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  }).catch((e) => {
    console.error('points flush failed:', e)
    // put the points back so they are not lost
    updates.forEach((u) =>
      queueScore(u.name, u.state, {
        points: u.points,
        poppers: u.poppers,
        hearts: u.hearts,
        performances: u.performances,
      }),
    )
  })
}

setInterval(flushScores, POINTS_FLUSH_MS)

// Sweep custom rooms that have been empty past the grace period. WhatsApp
// invites are the reason rooms must NOT die with the creator's socket: the
// sender closes the tab / locks the phone right after sharing, and the
// invitee may tap the link minutes later. 30 min is plenty and keeps the
// rooms Map tiny on the free tier.
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [id, room] of rooms) {
    // a scheduled room lives until its start time passes
    if (room.scheduleAt && room.scheduleAt > now) continue
    if (
      !room.isDefault &&
      room.participants.size === 0 &&
      (room.emptyAt ?? 0) + EMPTY_ROOM_TTL_MS < now
    ) {
      clearRoomGames(room)
      rooms.delete(id)
    }
  }
}, 60_000)

/* ------------------------------ socket layer ------------------------------ */

io.on('connection', (socket: Socket) => {
  console.log(`socket connected: ${socket.id}`)
  let joinedRoom: Room | null = null
  let lastAwardAt = 0

  const leaveCurrentRoom = () => {
    if (!joinedRoom) return
    const room = joinedRoom
    joinedRoom = null
    socket.leave(room.id)
    removeParticipant(room, socket.id, 'left the stage')
  }

  /* ------------------------------- rooms -------------------------------- */

  socket.on('list-rooms', (data: { state: string }, ack?: (rooms: unknown[]) => void) => {
    const state = (data?.state ?? '').trim()
    if (!state) return
    const list = roomListForState(state)
    if (typeof ack === 'function') ack(list)
    else socket.emit('room-list', { state, rooms: list })
  })

  socket.on(
    'join-room',
    (data: JoinPayload, ack?: (res: { ok: boolean; error?: string; room?: unknown }) => void) => {
      try {
        const state = (data?.state ?? '').trim()
        const name = (data?.profile?.name ?? '').trim().slice(0, 24) || 'Anonymous'
        const color = /^#[0-9A-Fa-f]{6}$/.test(data?.profile?.color ?? '')
          ? data.profile.color
          : AVATAR_COLORS[0]
        const avatar =
          typeof data?.profile?.avatar === 'string' ? data.profile.avatar.trim().slice(0, 4) : ''
        const pid = (data?.pid ?? '').trim().slice(0, 64) || `pid:${socket.id}`

        if (!state) return ack?.({ ok: false, error: 'State is required' })

        let room: Room | undefined
        if (data.roomId && data.roomId.startsWith('state:')) {
          room = ensureDefaultRoom(state)
        } else if (data.roomId) {
          const found = rooms.get(data.roomId)
          if (!found) return ack?.({ ok: false, error: 'Room not found — it may have closed' })
          room = found
        } else {
          room = ensureDefaultRoom(state)
        }

        const alreadyHere = room.participants.has(socket.id)
        if (!alreadyHere && room.participants.size >= MAX_PARTICIPANTS) {
          return ack?.({ ok: false, error: `Room is full (max ${MAX_PARTICIPANTS} singers)` })
        }

        // passcode-locked private rooms — the code must match to walk in
        if (room.passcode && room.passcode !== (data?.passcode ?? '')) {
          return ack?.({
            ok: false,
            error: '🔒 This room is locked — enter the passcode the host shared with you.',
          })
        }

        // someone is (re)joining — cancel the empty-room grace period
        room.emptyAt = undefined

        leaveCurrentRoom()

        // if default room is in another state than requested, fix it
        if (room.isDefault && room.state.toLowerCase() !== state.toLowerCase()) {
          room = ensureDefaultRoom(state)
        }

        // Same person rejoining (page refresh / flaky network / auto-rejoin
        // after a network blip): drop the stale socket entry so their name
        // stays theirs and the seat follows them. If the stale entry is a
        // socket that merely LOST connection inside the grace window, this is
        // a silent auto-rejoin — no fanfare, no "joined" messages.
        const stale = Array.from(room.participants.values()).find(
          (p) => p.pid === pid && p.id !== socket.id,
        )
        let isRejoin = false
        let staleJoinedAt = 0
        if (stale) {
          isRejoin = !!stale.disconnected
          staleJoinedAt = stale.joinedAt
          // a live rejoin cancels the pending disconnect-removal timer
          const pending = rejoinTimers.get(stale.pid)
          if (pending) {
            clearTimeout(pending)
            rejoinTimers.delete(stale.pid)
          }
          room.participants.delete(stale.id)
          if (room.stage && room.stage.singerId === stale.id) {
            room.stage.singerId = socket.id
          }
          if (room.hostId === stale.id) room.hostId = socket.id
          io.to(room.id).emit('participant-left', { id: stale.id, name: stale.name })
        }

        // Unique names inside a room — nobody can ride someone else's identity.
        const lower = name.toLowerCase()
        const nameTaken = Array.from(room.participants.values()).some(
          (p) => p.name.toLowerCase() === lower && p.pid !== pid,
        )
        if (nameTaken) {
          return ack?.({
            ok: false,
            error: `The name "${name}" is already taken in this room — pick another one.`,
          })
        }

        const existing = room.participants.get(socket.id)
        if (existing) {
          existing.pid = pid
          existing.name = name
          existing.color = color
          existing.avatar = avatar
          existing.micOn = !!data.micOn
          existing.camOn = !!data.camOn
          existing.disconnected = undefined
          if (room.stage && room.stage.singerId === socket.id) room.stage.singerName = name
        } else {
          room.participants.set(socket.id, {
            id: socket.id,
            pid,
            name,
            color,
            avatar,
            micOn: !!data.micOn,
            camOn: !!data.camOn,
            // a rejoin restores the original join order (and host status)
            isHost: room.hostId === socket.id,
            joinedAt: isRejoin && staleJoinedAt ? staleJoinedAt : Date.now(),
          })
          if (!room.hostId) {
            room.hostId = socket.id
            room.participants.get(socket.id)!.isHost = true
          }
          if (!isRejoin) {
            const m = sysMsg(room, `${name} joined the stage 🎤`)
            io.to(room.id).emit('participant-joined', {
              participant: room.participants.get(socket.id),
              message: m,
            })
          }
        }

        joinedRoom = room
        socket.join(room.id)

        ack?.({ ok: true, room: roomSnapshot(room) })
        broadcastRoom(room)
        if (room.karaoke) broadcastKaraoke(room)
        console.log(`${name} joined room ${room.name} [${room.state}] (${room.participants.size} online)`)
      } catch (e) {
        console.error('join-room error', e)
        ack?.({ ok: false, error: 'Failed to join room' })
      }
    },
  )

  socket.on(
    'create-room',
    (
      data: {
        name: string
        state: string
        kind?: 'hangout' | 'sing'
        tags?: unknown
        passcode?: string
        scheduleAt?: number
      },
      ack?: (res: { ok: boolean; error?: string; roomId?: string }) => void,
    ) => {
    const state = (data?.state ?? '').trim()
    const name = (data?.name ?? '').trim().slice(0, 40)
    if (!state) return ack?.({ ok: false, error: 'State is required' })
    if (!name) return ack?.({ ok: false, error: 'Room name is required' })
    // room type: 'hangout' (chat-first, default) or 'sing' (dedicated
    // singing room — opens straight into the Sing Along activity)
    const kind = data?.kind === 'sing' ? 'sing' : 'hangout'
    // vibe tags — validated against the fixed catalog, max 3
    const tags = cleanTags(data?.tags)
    // optional passcode lock (4-8 digits) — private family/friend rooms
    const passcode = /^\d{4,8}$/.test(String(data?.passcode ?? '')) ? String(data.passcode) : undefined
    // optional schedule ("Antakshari tonight 9 PM") — epoch ms, within 7 days
    const scheduleRaw = Number(data?.scheduleAt)
    const scheduleAt =
      Number.isFinite(scheduleRaw) &&
      scheduleRaw > Date.now() + 60_000 &&
      scheduleRaw < Date.now() + MAX_SCHEDULE_MS
        ? scheduleRaw
        : undefined

    const full = Array.from(rooms.values()).filter((r) => r.state.toLowerCase() === state.toLowerCase()).length >= 50
    if (full) return ack?.({ ok: false, error: 'Too many open rooms in this state' })

    const room: Room = {
      id: randomCode(),
      name,
      state,
      hostId: '',
      createdAt: Date.now(),
      isDefault: false,
      participants: new Map(),
      // born empty — the grace period starts now, before the creator joins
      emptyAt: Date.now(),
      ...defaultRoomObjects(),
    }
    if (kind === 'sing') {
      room.kind = 'sing'
      // a singing room IS the Sing Along activity — it opens on the stage
      room.activity = 'sing'
    }
    room.tags = tags
    if (passcode) room.passcode = passcode
    if (scheduleAt) room.scheduleAt = scheduleAt
    rooms.set(room.id, room)
    ack?.({ ok: true, roomId: room.id })
    }
  )

  socket.on('leave-room', () => {
    const room = joinedRoom
    const name = room?.participants.get(socket.id)?.name
    leaveCurrentRoom()
    socket.emit('left-room')
    if (room && name) broadcastRoom(room)
  })

  /* ---------------------------- media state ------------------------------ */

  socket.on('media-state', (data: { micOn: boolean; camOn: boolean }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return
    // host-enforced mute wins — a force-muted participant cannot unmute
    me.micOn = !me.forcedMuted && !!data.micOn
    me.camOn = !!data.camOn
    if (me.forcedMuted && data.micOn) {
      socket.emit('force-mute', { muted: true })
    }
    broadcastRoom(room)
  })

  /* --------------------- room activities ------------------------------- */

  // One tap starts a shared activity and the whole room flips together:
  //  - 'sing'   → stage layout (Main Seat + karaoke) until it ends
  //  - 'listen' → Listen Together — shared YouTube music, chat stays open
  //  - 'watch'  → Watch Party — shared YouTube video, chat stays open
  socket.on(
    'activity-start',
    (data: { kind?: string }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const room = joinedRoom
      const me = room?.participants.get(socket.id)
      if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
      const kind = data?.kind === 'listen' || data?.kind === 'watch' ? data.kind : 'sing'
      if (room.activity === kind) return ack?.({ ok: true })
      room.activity = kind
      const copy =
        kind === 'listen'
          ? `🎧 ${me.name} started Listen Together — queue a track everyone hears in sync!`
          : kind === 'watch'
            ? `📺 ${me.name} started a Watch Party — play a video for the whole room!`
            : `🎤 ${me.name} started Sing Along — grab the Main Seat or queue a track!`
      const m = sysMsg(room, copy)
      io.to(room.id).emit('chat', { message: m })
      broadcastRoom(room)
      ack?.({ ok: true })
    },
  )

  socket.on('activity-end', (ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
    if (room.activity === 'chat') return ack?.({ ok: true })
    const ended = room.activity
    // an explicit End always drops the room into the chat-first hangout —
    // the room keeps its singing IDENTITY via kind (only last-leave re-parks
    // kind='sing' rooms back on the stage for the next arrival)
    room.activity = 'chat'
    // the activity is over: free the seat, stop the media, back to the hangout
    if (room.stage) {
      const s = sysMsg(room, `👏 ${room.stage.singerName} stepped down — Sing Along ended`)
      io.to(room.id).emit('chat', { message: s })
      room.stage = null
    }
    room.karaoke = null
    const copy =
      ended === 'listen'
        ? `🎧 ${me.name} ended Listen Together — back to the hangout!`
        : ended === 'watch'
          ? `📺 ${me.name} ended the Watch Party — back to the hangout!`
          : `🫶 ${me.name} ended the Sing Along — back to the hangout!`
    const m = sysMsg(room, copy)
    io.to(room.id).emit('chat', { message: m })
    broadcastRoom(room)
    ack?.({ ok: true })
  })

  /* ------------------------- host controls ------------------------------- */

  // Host-enforced mute: the target's client self-mutes AND the service keeps
  // rejecting their mic-on media-state until the host unmutes them.
  socket.on(
    'host-mute',
    (data: { targetId: string; muted: boolean }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const room = joinedRoom
      const me = room?.participants.get(socket.id)
      if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
      if (room.hostId !== socket.id)
        return ack?.({ ok: false, error: 'Only the host can do that' })
      const target = room.participants.get(data?.targetId ?? '')
      if (!target) return ack?.({ ok: false, error: 'That participant already left' })
      if (target.id === socket.id) return ack?.({ ok: false, error: 'Use your own mic button 🙂' })
      const muted = !!data.muted
      target.forcedMuted = muted || undefined
      if (muted) {
        target.micOn = false
        io.to(target.id).emit('force-mute', { muted: true })
      } else {
        io.to(target.id).emit('force-mute', { muted: false })
      }
      const m = sysMsg(
        room,
        muted ? `🔇 ${me.name} muted ${target.name}` : `🎙️ ${me.name} unmuted ${target.name}`,
      )
      io.to(room.id).emit('chat', { message: m })
      broadcastRoom(room)
      ack?.({ ok: true })
    },
  )

  // Host removes a troublemaker: they are dropped back to the lobby with a
  // clear message. They may rejoin — the report flow covers repeat offenders.
  socket.on(
    'host-remove',
    (data: { targetId: string }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const room = joinedRoom
      const me = room?.participants.get(socket.id)
      if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
      if (room.hostId !== socket.id)
        return ack?.({ ok: false, error: 'Only the host can do that' })
      const target = room.participants.get(data?.targetId ?? '')
      if (!target) return ack?.({ ok: false, error: 'That participant already left' })
      if (target.id === socket.id) return ack?.({ ok: false, error: 'You are the host 🙂' })
      room.participants.delete(target.id)
      const m = sysMsg(room, `⛔ ${me.name} removed ${target.name} from the room`)
      io.to(room.id).emit('chat', { message: m })
      io.to(target.id).emit('removed-from-room', {
        message: `The host removed you from ${room.name}. You can rejoin or find another room.`,
      })
      io.to(room.id).emit('participant-left', { id: target.id, name: target.name })
      broadcastRoom(room)
      ack?.({ ok: true })
    },
  )

  /* --------------------- reactions & reports ------------------------------ */

  // floating hearts — pure fun, no points, available in every activity
  socket.on(
    'room-reaction',
    (data: { kind?: string }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const room = joinedRoom
      const me = room?.participants.get(socket.id)
      if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
      const kind = data?.kind === 'heart' ? 'heart' : 'heart' // more kinds later
      io.to(room.id).emit('room-reaction', {
        id: msgId(),
        kind,
        by: socket.id,
        byName: me.name,
        at: Date.now(),
      })
      ack?.({ ok: true })
    },
  )

  // abuse report — logged server-side with room/user context for moderation
  socket.on(
    'room-report',
    (
      data: { reason?: string; targetName?: string },
      ack?: (res: { ok: boolean; error?: string }) => void,
    ) => {
      const room = joinedRoom
      const me = room?.participants.get(socket.id)
      if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
      const reason = (data?.reason ?? 'unspecified').slice(0, 120)
      const targetName = (data?.targetName ?? '').slice(0, 24)
      room.reports += 1
      console.log(
        `[REPORT] room=${room.id} state=${room.state} by=${me.name}` +
          (targetName ? ` against=${targetName}` : '') +
          ` reason="${reason}" online=${room.participants.size}`,
      )
      ack?.({ ok: true })
    },
  )

  /* ---------------------------- chat ------------------------------------- */

  socket.on('chat', (data: { text: string }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    const text = (data?.text ?? '').trim().slice(0, 300)
    if (!room || !me || !text) return
    const m: ChatMessage = {
      id: msgId(),
      type: 'user',
      from: socket.id,
      name: me.name,
      color: me.color,
      avatar: me.avatar || undefined,
      text,
      at: Date.now(),
    }
    pushChat(room, m)
    io.to(room.id).emit('chat', { message: m })
  })

  /* ------------------------- webRTC signaling ---------------------------- */

  socket.on('webrtc-offer', (data: { to: string; sdp: string }) => {
    if (!data?.to || !data?.sdp) return
    io.to(data.to).emit('webrtc-offer', { from: socket.id, sdp: data.sdp })
  })

  socket.on('webrtc-answer', (data: { to: string; sdp: string }) => {
    if (!data?.to || !data?.sdp) return
    io.to(data.to).emit('webrtc-answer', { from: socket.id, sdp: data.sdp })
  })

  socket.on('webrtc-ice', (data: { to: string; candidate: RTCIceCandidateInit }) => {
    if (!data?.to || !data?.candidate) return
    io.to(data.to).emit('webrtc-ice', { from: socket.id, candidate: data.candidate })
  })

  /* --------------------------- the Main Seat ------------------------------ */

  socket.on('stage-take', (ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })

    // the Main Seat belongs to the Sing Along activity — it cannot exist in
    // a plain hangout (defense in depth: the hangout UI has no seat either)
    if (room.activity !== 'sing')
      return ack?.({ ok: false, error: 'Start Sing Along first — tap 🎤 in the toolbar.' })

    if (room.stage) {
      if (room.stage.singerId === socket.id) return ack?.({ ok: true })
      return ack?.({ ok: false, error: `${room.stage.singerName} is on the Main Seat — wait for them to step down.` })
    }

    room.stage = {
      singerId: socket.id,
      singerName: me.name,
      singerColor: me.color,
      since: Date.now(),
      points: 0,
      poppers: 0,
      hearts: 0,
    }
    queueScore(me.name, room.state, { performances: 1 })

    const m = sysMsg(room, `🎤 ${me.name} took the Main Seat — cheer with poppers & hearts!`)
    io.to(room.id).emit('chat', { message: m })
    broadcastRoom(room)
    ack?.({ ok: true })
  })

  socket.on('stage-leave', (ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    if (!room?.stage || room.stage.singerId !== socket.id) return ack?.({ ok: false })
    const name = room.stage.singerName
    const pts = room.stage.points
    room.stage = null
    const m = sysMsg(room, `👏 ${name} stepped down from the Main Seat (${pts} pts this session)`)
    io.to(room.id).emit('chat', { message: m })
    broadcastRoom(room)
    ack?.({ ok: true })
  })

  socket.on('stage-award', (data: { kind: 'popper' | 'heart' }, ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
    const stage = room.stage
    if (!stage) return ack?.({ ok: false, error: 'Nobody is in the Main Seat right now' })
    if (stage.singerId === socket.id)
      return ack?.({ ok: false, error: 'You cannot applaud your own performance 😄' })

    const now = Date.now()
    if (now - lastAwardAt < AWARD_COOLDOWN_MS)
      return ack?.({ ok: false, error: 'Easy! Give the singer a moment 😊' })
    lastAwardAt = now

    const kind = data?.kind === 'heart' ? 'heart' : 'popper'
    const points = kind === 'heart' ? HEART_POINTS : POPPER_POINTS
    stage.points += points
    if (kind === 'heart') stage.hearts += 1
    else stage.poppers += 1

    queueScore(stage.singerName, room.state, {
      points,
      poppers: kind === 'popper' ? 1 : 0,
      hearts: kind === 'heart' ? 1 : 0,
    })

    const applause: ApplauseEvent = {
      id: msgId(),
      kind,
      points,
      by: socket.id,
      byName: me.name,
      singerId: stage.singerId,
      singerName: stage.singerName,
      stage: { points: stage.points, poppers: stage.poppers, hearts: stage.hearts },
      at: now,
    }
    io.to(room.id).emit('stage-applause', applause)
    broadcastRoom(room)
    ack?.({ ok: true })
  })

  /* ------------------------------ karaoke -------------------------------- */

  socket.on('karaoke-load', (data: { videoId: string; title?: string }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return
    const videoId = (data?.videoId ?? '').trim()
    if (!validVideoId(videoId)) return
    room.karaoke = {
      videoId,
      title: (data?.title ?? '').slice(0, 160),
      playing: true,
      positionAt: 0,
      updatedAt: Date.now(),
      by: socket.id,
      byName: me.name,
      queue: (room.karaoke?.queue ?? []).filter((q) => q.videoId !== videoId),
    }
    const m = sysMsg(room, `🎵 ${me.name} queued a karaoke track — sing along!`)
    io.to(room.id).emit('chat', { message: m })
    broadcastKaraoke(room)
  })

  socket.on('karaoke-play', (data: { position?: number }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me || !room.karaoke) return
    const k = room.karaoke
    k.playing = true
    k.positionAt = Math.max(0, Number(data?.position) || 0)
    k.updatedAt = Date.now()
    k.by = socket.id
    k.byName = me.name
    broadcastKaraoke(room)
  })

  socket.on('karaoke-pause', (data: { position?: number }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me || !room.karaoke) return
    const k = room.karaoke
    k.playing = false
    k.positionAt = Math.max(0, Number(data?.position) || 0)
    k.updatedAt = Date.now()
    k.by = socket.id
    k.byName = me.name
    broadcastKaraoke(room)
  })

  socket.on('karaoke-seek', (data: { position?: number }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me || !room.karaoke) return
    const k = room.karaoke
    k.positionAt = Math.max(0, Number(data?.position) || 0)
    k.updatedAt = Date.now()
    k.by = socket.id
    k.byName = me.name
    broadcastKaraoke(room)
  })

  socket.on('karaoke-ended', () => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !room.karaoke) return
    // de-dupe simultaneous ENDED events from several clients
    if (Date.now() - room.karaokeEndedAt < 2000) return
    room.karaokeEndedAt = Date.now()
    const k = room.karaoke
    const next = k.queue.shift()
    if (next) {
      k.videoId = next.videoId
      k.title = next.title
      k.playing = true
      k.positionAt = 0
      k.updatedAt = Date.now()
      k.by = next.by
      k.byName = next.byName || me?.name || 'Anonymous'
      const m = sysMsg(room, `⏭️ Now playing from the queue: ${k.title || 'a track'}`)
      io.to(room.id).emit('chat', { message: m })
    } else {
      k.playing = false
      k.updatedAt = Date.now()
      k.by = socket.id
    }
    broadcastKaraoke(room)
  })

  socket.on('karaoke-queue-add', (data: { videoId: string; title?: string }) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return
    const videoId = (data?.videoId ?? '').trim()
    if (!validVideoId(videoId)) return
    const k = room.karaoke ?? {
      videoId: '', title: '', playing: false, positionAt: 0,
      updatedAt: 0, by: '', byName: '', queue: [],
    }
    if (k.queue.length >= MAX_KARAOKE_QUEUE) return
    if (k.queue.some((q) => q.videoId === videoId) || k.videoId === videoId) return
    k.queue.push({
      videoId,
      title: (data?.title ?? '').slice(0, 160),
      by: socket.id,
      byName: me.name,
    })
    room.karaoke = k
    broadcastKaraoke(room)
  })

  socket.on('karaoke-queue-remove', (data: { index: number }) => {
    const room = joinedRoom
    if (!room?.karaoke) return
    const idx = Math.round(Number(data?.index))
    if (!Number.isInteger(idx) || idx < 0 || idx >= room.karaoke.queue.length) return
    room.karaoke.queue.splice(idx, 1)
    broadcastKaraoke(room)
  })

  /* ---------------------------- party games ------------------------------- */

  // Live trivia quiz — anyone can start one; 5 questions, 15s each, the
  // first correct answer scores 100 and later correct answers score 50.
  socket.on('quiz-start', (ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
    if (room.quiz) return ack?.({ ok: false, error: 'A quiz is already running' })
    const shuffled = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5)
    room.quiz = {
      questions: shuffled.slice(0, QUIZ_ROUNDS),
      index: 0,
      phase: 'question',
      endsAt: Date.now() + QUIZ_ANSWER_MS,
      answers: {},
      scores: {},
      byName: me.name,
    }
    const m = sysMsg(room, `🎲 ${me.name} started a Bollywood quiz — open 🎲 Games to play!`)
    io.to(room.id).emit('chat', { message: m })
    broadcastRoom(room)
    scheduleQuizTick(room.id, QUIZ_ANSWER_MS)
    ack?.({ ok: true })
  })

  socket.on(
    'quiz-answer',
    (data: { choice: number }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const room = joinedRoom
      const me = room?.participants.get(socket.id)
      const quiz = room?.quiz
      if (!room || !me || !quiz) return ack?.({ ok: false, error: 'No quiz running' })
      if (quiz.phase !== 'question') return ack?.({ ok: false, error: 'Too late — answer revealed!' })
      const choice = Math.round(Number(data?.choice))
      if (!Number.isInteger(choice) || choice < 0 || choice > 3)
        return ack?.({ ok: false, error: 'Pick one of the four options' })
      if (quiz.answers[socket.id]) return ack?.({ ok: true }) // one answer each
      quiz.answers[socket.id] = { choice, at: Date.now(), name: me.name }
      broadcastRoom(room)
      ack?.({ ok: true })
    },
  )

  // Truth-or-Dare / Rapid-fire prompt cards — spin for a random prompt
  socket.on(
    'prompts-start',
    (data: { mode?: string }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const room = joinedRoom
      const me = room?.participants.get(socket.id)
      if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
      const mode = data?.mode === 'dare' ? 'dare' : data?.mode === 'rapid' ? 'rapid' : 'truth'
      const text = mode === 'dare' ? pick(DARES) : mode === 'rapid' ? pick(RAPID) : pick(TRUTHS)
      const target = pickTarget(room, me.name)
      room.prompts = { mode, text, target, byName: me.name, at: Date.now() }
      const label = mode === 'dare' ? 'Dare 💪' : mode === 'rapid' ? 'Rapid-fire ⚡' : 'Truth 💬'
      const m = sysMsg(room, `🎯 ${label} for ${target}: ${text}`)
      io.to(room.id).emit('chat', { message: m })
      broadcastRoom(room)
      ack?.({ ok: true })
    },
  )

  socket.on('prompts-next', (ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me || !room.prompts) return ack?.({ ok: false, error: 'No prompt game running' })
    const mode = room.prompts.mode
    const bank = mode === 'dare' ? DARES : mode === 'rapid' ? RAPID : TRUTHS
    let text = pick(bank)
    let guard = 0
    while (text === room.prompts.text && bank.length > 1 && guard++ < 8) text = pick(bank)
    const target = pickTarget(room, me.name)
    room.prompts = { mode, text, target, byName: me.name, at: Date.now() }
    const m = sysMsg(room, `🎯 Next up — ${target}: ${text}`)
    io.to(room.id).emit('chat', { message: m })
    broadcastRoom(room)
    ack?.({ ok: true })
  })

  socket.on('prompts-end', (ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    if (!room || !room.prompts) return ack?.({ ok: false, error: 'No prompt game running' })
    room.prompts = null
    broadcastRoom(room)
    ack?.({ ok: true })
  })

  // The classic Antakshari letter game — Sing Along activity only.
  // Current singer has 45s: sing a song starting with the letter, type the
  // song name, tap Done — the next letter comes from the song's last letter.
  socket.on('antakshari-start', (ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    const me = room?.participants.get(socket.id)
    if (!room || !me) return ack?.({ ok: false, error: 'Join a room first' })
    if (room.activity !== 'sing')
      return ack?.({ ok: false, error: 'Start Sing Along first — Antakshari lives on the stage.' })
    if (room.antakshari) return ack?.({ ok: false, error: 'Antakshari is already running' })
    if (room.participants.size < 1) return ack?.({ ok: false, error: 'Nobody is here yet' })
    const players = Array.from(room.participants.values())
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => p.name)
    const turnIdx = Math.floor(Math.random() * players.length)
    room.antakshari = {
      players,
      turnIdx,
      letter: pick(ANTAKSHARI_LETTERS),
      scores: {},
      endsAt: Date.now() + ANTAK_TURN_MS,
      byName: me.name,
    }
    const m = sysMsg(
      room,
      `🎵 Antakshari begins! ${players[turnIdx]} starts — sing a song with the letter "${room.antakshari.letter}", then tap Done!`,
    )
    io.to(room.id).emit('chat', { message: m })
    broadcastRoom(room)
    scheduleAntakTick(room.id, ANTAK_TURN_MS)
    ack?.({ ok: true })
  })

  socket.on(
    'antakshari-done',
    (data: { song?: string }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const room = joinedRoom
      const me = room?.participants.get(socket.id)
      const game = room?.antakshari
      if (!room || !me || !game) return ack?.({ ok: false, error: 'No Antakshari running' })
      const current = game.players[game.turnIdx]
      if (current !== me.name)
        return ack?.({ ok: false, error: `It's ${current}'s turn — wait for yours!` })
      const song = (data?.song ?? '').trim().slice(0, 80)
      if (!song) return ack?.({ ok: false, error: 'Type the song name first' })
      game.scores[me.name] = (game.scores[me.name] ?? 0) + 10
      // classic rule: next letter = last letter of the song you sang
      const letters = song.toUpperCase().replace(/[^A-Z]/g, '')
      let nextLetter = letters.length > 0 ? letters[letters.length - 1]! : ''
      if (!/[A-Z]/.test(nextLetter) || nextLetter === game.letter)
        nextLetter = pick(ANTAKSHARI_LETTERS.filter((l) => l !== game.letter))
      game.letter = nextLetter
      game.turnIdx = nextAntakTurn(game, room)
      game.endsAt = Date.now() + ANTAK_TURN_MS
      const next = game.players[game.turnIdx]
      const m = sysMsg(
        room,
        `🎶 ${me.name} sang "${song}" (+10) — ${next}, sing a song with "${game.letter}"!`,
      )
      io.to(room.id).emit('chat', { message: m })
      broadcastRoom(room)
      scheduleAntakTick(room.id, ANTAK_TURN_MS)
      ack?.({ ok: true })
    },
  )

  socket.on('antakshari-end', (ack?: (res: { ok: boolean; error?: string }) => void) => {
    const room = joinedRoom
    if (!room || !room.antakshari) return ack?.({ ok: false, error: 'No Antakshari running' })
    const game = room.antakshari
    const board = Object.entries(game.scores)
      .sort((a, b) => b[1] - a[1])
      .map(([name, pts], i) => `${i + 1}. ${name} — ${pts}`)
      .join(' · ')
    const winner = Object.entries(game.scores).sort((a, b) => b[1] - a[1])[0]?.[0]
    const m = sysMsg(
      room,
      `🏆 Antakshari over! ${winner ? `${winner} wins! ` : ''}${board || 'No scores on the board.'}`,
    )
    io.to(room.id).emit('chat', { message: m })
    room.antakshari = null
    const t = antakTimers.get(room.id)
    if (t) clearTimeout(t)
    antakTimers.delete(room.id)
    broadcastRoom(room)
    ack?.({ ok: true })
  })

  // network-quality probe — the client measures the ack round-trip
  socket.on('latency-ping', (ack?: () => void) => {
    if (typeof ack === 'function') ack()
  })

  /* ------------------------------ cleanup -------------------------------- */

  // A dropped socket (lift, tunnel, 4G blip) does NOT instantly remove the
  // participant: their seat is held for REJOIN_GRACE_MS and a rejoining
  // client with the same pid silently resumes it (auto-rejoin). Only when
  // the grace expires do we say goodbye for real.
  socket.on('disconnect', () => {
    console.log(`socket disconnected: ${socket.id}`)
    const room = joinedRoom
    joinedRoom = null
    if (!room) return
    const me = room.participants.get(socket.id)
    if (!me) return
    me.disconnected = true
    socket.leave(room.id)
    broadcastRoom(room) // others see "reconnecting…" on their tile
    const pid = me.pid
    const prev = rejoinTimers.get(pid)
    if (prev) clearTimeout(prev)
    rejoinTimers.set(
      pid,
      setTimeout(() => {
        rejoinTimers.delete(pid)
        const r = rooms.get(room.id)
        const p = r?.participants.get(socket.id)
        if (r && p && p.disconnected) removeParticipant(r, socket.id, 'lost connection')
      }, REJOIN_GRACE_MS),
    )
  })

  socket.on('error', (e) => console.error(`socket error (${socket.id}):`, e))
})

httpServer.listen(PORT, () => {
  console.log(`✅ DesiHangout realtime service running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
