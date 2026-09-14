'use client'

/**
 * People & Safety panel — one place for everything social:
 *  - participant list with the host crown
 *  - host controls: enforce-mute / remove (server-backed, trollers can't bypass)
 *  - Data Saver toggle (audio-first mode for tight mobile data)
 *  - report the room
 *  - unblock previously blocked users
 */

import { useState } from 'react'
import { Bookmark, BookmarkCheck, Crown, Flag, Gauge, ShieldBan, UserX, Volume2, VolumeX, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Participant, RoomSnapshot } from '@/hooks/use-room'
import { addVibeFriend, isVibeFriend, matchVibeFriends, removeVibeFriend, VibeFriend } from '@/lib/social'

interface PeoplePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: RoomSnapshot
  myId: string
  blocked: string[]
  dataSaver: boolean
  onToggleDataSaver: () => void
  onHostMute: (targetId: string, muted: boolean) => void
  onHostRemove: (targetId: string) => void
  onUnblock: (name: string) => void
  onReport: () => void
}

export function PeoplePanel({
  open,
  onOpenChange,
  room,
  myId,
  blocked,
  dataSaver,
  onToggleDataSaver,
  onHostMute,
  onHostRemove,
  onUnblock,
  onReport,
}: PeoplePanelProps) {
  // re-render tick for localStorage-backed vibe friends (not reactive)
  const [vibeTick, setVibeTick] = useState(0)
  void vibeTick
  const iAmHost = room.hostId === myId
  const others = room.participants.filter((p) => p.id !== myId)
  const vibeFriendsHere: VibeFriend[] = matchVibeFriends(room.participants.map((p) => p.name))

  const toggleVibe = (p: Participant) => {
    if (isVibeFriend(p.name)) removeVibeFriend(p.name)
    else addVibeFriend(p.name, p.avatar)
    // re-render by touching the list (localStorage is not reactive)
    setVibeTick((t) => t + 1)
  }

  const row = (p: Participant) => {
    const isMe = p.id === myId
    const canAct = iAmHost && !isMe
    return (
      <div
        key={p.id}
        className="flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2"
        data-testid={`people-row-${p.name}`}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-white"
          style={{ backgroundColor: p.color }}
        >
          {p.avatar ? p.avatar : p.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-xs font-bold text-white">
            {p.name}
            {isMe && <span className="font-normal text-neutral-500">(you)</span>}
            {p.id === room.hostId && (
              <Crown className="h-3 w-3 shrink-0 text-[#F5A623]" aria-label="host" />
            )}
          </p>
          <p className="text-[10px] text-neutral-500">
            {p.disconnected
              ? '📶 reconnecting…'
              : p.forcedMuted
                ? '🔇 muted by host'
                : p.micOn
                  ? p.camOn
                    ? 'mic · cam on'
                    : 'mic on'
                  : 'listener'}
          </p>
        </div>
        {/* vibe bookmark — remembers people you clicked with (this device only) */}
        {!isMe && (
          <button
            onClick={() => toggleVibe(p)}
            aria-label={
              isVibeFriend(p.name)
                ? `Remove ${p.name} from your vibe friends`
                : `Save ${p.name} as a vibe friend`
            }
            title={
              isVibeFriend(p.name)
                ? 'Vibed — tap to remove'
                : 'Vibed with you — remember this person'
            }
            data-testid={`vibe-${p.name}`}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
              isVibeFriend(p.name)
                ? 'bg-[#F5A623]/20 text-[#F5A623]'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
            }`}
          >
            {isVibeFriend(p.name) ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
          </button>
        )}
        {canAct && (
          <span className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => onHostMute(p.id, !p.forcedMuted)}
              aria-label={p.forcedMuted ? `Unmute ${p.name}` : `Mute ${p.name}`}
              title={p.forcedMuted ? 'Let them speak again' : 'Mute them for everyone'}
              data-testid={`mute-${p.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-neutral-300 transition hover:bg-neutral-700 hover:text-white"
            >
              {p.forcedMuted ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => onHostRemove(p.id)}
              aria-label={`Remove ${p.name} from the room`}
              title="Remove from the room"
              data-testid={`remove-${p.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-[#ff6b6b] transition hover:bg-[#E50914] hover:text-white"
            >
              <UserX className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] max-w-sm gap-4 overflow-y-auto rounded-2xl border-neutral-800 bg-[#141414]"
        data-testid="people-panel"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black text-white">
            <Crown className="h-4 w-4 text-[#F5A623]" /> People &amp; safety
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-400">
            {room.participants.length}/8 in the room
            {iAmHost ? ' · you are the host 👑' : ''}
          </DialogDescription>
        </DialogHeader>

        {/* participants */}
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1" data-testid="people-list">
          {room.participants
            .slice()
            .sort((a, b) => (a.id === room.hostId ? -1 : b.id === room.hostId ? 1 : a.joinedAt - b.joinedAt))
            .map(row)}
        </div>

        {/* vibe friends here — the reunion moment */}
        {vibeFriendsHere.length > 0 && (
          <div className="rounded-lg border border-[#F5A623]/40 bg-[#F5A623]/10 p-3" data-testid="vibe-friends-here">
            <p className="text-xs font-bold text-[#F5A623]">
              🎉 {vibeFriendsHere.length === 1 ? 'Vibe friend here' : `${vibeFriendsHere.length} vibe friends here`}:{' '}
              {vibeFriendsHere.map((v) => `${v.avatar ?? ''}${v.name}`).join(', ')}
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-neutral-400">
              Saved on this device from a past hangout. Tap the bookmark to forget someone.
            </p>
          </div>
        )}

        {/* data saver */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Gauge className="h-3.5 w-3.5 text-green-500" /> Data Saver
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-neutral-500">
                Audio-first: your camera turns off and videos are hidden. Best on tight mobile data.
              </p>
            </div>
            <button
              onClick={onToggleDataSaver}
              role="switch"
              aria-checked={dataSaver}
              aria-label="Toggle Data Saver"
              data-testid="data-saver-toggle"
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                dataSaver ? 'bg-green-600' : 'bg-neutral-700'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                  dataSaver ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* blocked users */}
        {blocked.length > 0 && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-white">
              <ShieldBan className="h-3.5 w-3.5 text-neutral-400" /> Blocked users ({blocked.length})
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {blocked.map((name) => (
                <button
                  key={name}
                  onClick={() => onUnblock(name)}
                  data-testid={`unblock-${name}`}
                  className="flex items-center gap-1 rounded-full bg-neutral-800 px-2.5 py-1 text-[10px] font-bold text-neutral-300 transition hover:bg-[#E50914] hover:text-white"
                  title="Unblock"
                >
                  <X className="h-3 w-3" /> {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* report */}
        <button
          onClick={() => {
            onReport()
            onOpenChange(false)
          }}
          data-testid="report-room"
          className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-transparent px-3 py-2.5 text-left text-xs font-bold text-[#ff6b6b] transition hover:border-[#E50914]/60 hover:bg-[#E50914]/10"
        >
          <Flag className="h-3.5 w-3.5" /> Report this room
          <span className="ml-auto text-[10px] font-normal text-neutral-500">
            goes to moderators
          </span>
        </button>
      </DialogContent>
    </Dialog>
  )
}
