/**
 * Indian States / UTs + approximate geo bounding boxes for
 * location → state detection, plus anonymous profile helpers.
 */

export interface StateRegion {
  name: string
  emoji: string
  /** approximate bounding box [minLat, maxLat, minLng, maxLng] */
  bbox?: [number, number, number, number]
}

/** small states first so they win overlaps against big neighbors */
export const INDIAN_STATES: StateRegion[] = [
  { name: 'Delhi', emoji: '🏛️', bbox: [28.4, 28.9, 76.83, 77.4] },
  { name: 'Goa', emoji: '🏖️', bbox: [14.8, 15.8, 73.7, 74.4] },
  { name: 'Puducherry', emoji: '🌴', bbox: [11.86, 12.0, 79.7, 79.85] },
  { name: 'Chandigarh', emoji: '🌹', bbox: [30.6, 30.8, 76.6, 76.9] },
  { name: 'Sikkim', emoji: '🏔️', bbox: [27.08, 28.13, 88.0, 88.96] },
  { name: 'Tripura', emoji: '🌿', bbox: [22.94, 24.53, 91.17, 92.5] },
  { name: 'Manipur', emoji: '💐', bbox: [23.83, 25.68, 93.0, 94.78] },
  { name: 'Mizoram', emoji: '🎶', bbox: [21.92, 24.5, 92.15, 93.47] },
  { name: 'Nagaland', emoji: '🥁', bbox: [25.0, 27.02, 93.53, 95.58] },
  { name: 'Meghalaya', emoji: '🌧️', bbox: [25.03, 26.15, 89.8, 92.85] },
  { name: 'Arunachal Pradesh', emoji: '🌄', bbox: [26.62, 29.5, 91.5, 97.4] },
  { name: 'Assam', emoji: '🦏', bbox: [24.0, 28.0, 89.6, 96.1] },
  { name: 'West Bengal', emoji: '🎨', bbox: [21.5, 27.4, 85.8, 89.9] },
  { name: 'Jharkhand', emoji: '⛏️', bbox: [22.0, 25.6, 83.3, 87.9] },
  { name: 'Bihar', emoji: '🙏', bbox: [24.3, 27.5, 83.3, 88.3] },
  { name: 'Odisha', emoji: '🛕', bbox: [17.8, 22.6, 81.4, 87.6] },
  { name: 'Chhattisgarh', emoji: '🌾', bbox: [17.8, 24.2, 80.4, 84.4] },
  { name: 'Uttarakhand', emoji: '⛰️', bbox: [28.7, 31.5, 77.6, 81.1] },
  { name: 'Himachal Pradesh', emoji: '❄️', bbox: [30.3, 33.3, 75.5, 79.0] },
  { name: 'Punjab', emoji: '🥻', bbox: [29.5, 32.6, 73.8, 76.9] },
  { name: 'Haryana', emoji: '🚜', bbox: [27.6, 30.9, 74.5, 77.6] },
  { name: 'Rajasthan', emoji: '🐪', bbox: [23.0, 30.2, 69.5, 78.3] },
  { name: 'Uttar Pradesh', emoji: '🕌', bbox: [23.9, 30.4, 77.0, 84.7] },
  { name: 'Madhya Pradesh', emoji: '🐯', bbox: [21.9, 26.9, 74.0, 82.8] },
  { name: 'Gujarat', emoji: '🦁', bbox: [20.1, 24.7, 68.2, 74.5] },
  { name: 'Maharashtra', emoji: '🎭', bbox: [15.6, 22.1, 72.6, 80.9] },
  { name: 'Telangana', emoji: '💎', bbox: [15.8, 19.9, 77.3, 81.8] },
  { name: 'Andhra Pradesh', emoji: '🥭', bbox: [12.6, 19.9, 76.7, 84.8] },
  { name: 'Karnataka', emoji: '🎻', bbox: [11.6, 18.5, 74.1, 78.6] },
  { name: 'Kerala', emoji: '🛶', bbox: [8.3, 12.8, 74.9, 77.5] },
  { name: 'Tamil Nadu', emoji: '🗼', bbox: [8.1, 13.6, 76.2, 80.4] },
  { name: 'Jammu & Kashmir', emoji: '🏔️', bbox: [32.2, 37.1, 73.9, 80.4] },
  { name: 'Ladakh', emoji: '🏔️', bbox: [32.3, 36.0, 75.8, 80.3] },
]

export function stateByName(name: string): StateRegion | undefined {
  return INDIAN_STATES.find((s) => s.name.toLowerCase() === name.toLowerCase())
}

/** match lat/lng to a state via bounding boxes (approximate, good enough) */
export function detectStateFromCoords(lat: number, lng: number): string | null {
  for (const s of INDIAN_STATES) {
    if (!s.bbox) continue
    const [minLat, maxLat, minLng, maxLng] = s.bbox
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) return s.name
  }
  return null
}

/* --------------------------- anonymous identity ---------------------------- */

const PREFIXES = ['Sur', 'Swara', 'Raag', 'Dhun', 'Geet', 'Sargam', 'Saaz', 'Taans', 'Alap', 'Jhankar']
const SUFFIXES = ['Star', 'King', 'Queen', 'Wave', 'Note', 'Echo', 'Storm', 'Rider', 'Fire', 'Moon']
const COLORS = [
  '#E50914', '#F5A623', '#2ECC71', '#1ABC9C', '#9B59B6',
  '#E91E63', '#F39C12', '#00BCD4', '#8BC34A', '#FF5722',
  '#FFC107', '#4CAF50', '#009688', '#673AB7', '#FF4081',
]

export interface AnonymousProfile {
  /** stable anonymous id — lets the room remember this device across refreshes */
  pid: string
  name: string
  color: string
  /** optional emoji avatar picked in the join dialog */
  avatar?: string
}

function randomPid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {}
  return `pid-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export function generateAnonymousProfile(): AnonymousProfile {
  const p = PREFIXES[Math.floor(Math.random() * PREFIXES.length)]
  const s = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]
  const n = Math.floor(10 + Math.random() * 90)
  return {
    pid: randomPid(),
    name: `${p}${s}${n}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }
}

/** true when this browser already picked a name before (returning user) */
export function hasStoredProfile(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !!localStorage.getItem('singalong-profile')
  } catch {
    return false
  }
}

export function loadProfile(): AnonymousProfile {
  if (typeof window === 'undefined') return { pid: '', name: 'Guest', color: '#E50914' }
  try {
    const raw = localStorage.getItem('singalong-profile')
    if (raw) {
      const p = JSON.parse(raw)
      if (typeof p?.name === 'string' && typeof p?.color === 'string') {
        // profiles saved before pid/avatar existed get the missing bits merged in
        if (!p.pid) {
          p.pid = randomPid()
          saveProfile(p)
        }
        if (typeof p.avatar !== 'string') p.avatar = ''
        return p
      }
    }
  } catch {}
  const fresh = generateAnonymousProfile()
  saveProfile(fresh)
  return fresh
}

export function saveProfile(p: AnonymousProfile) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('singalong-profile', JSON.stringify(p))
  } catch {}
}
