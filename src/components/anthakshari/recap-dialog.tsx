'use client'

/**
 * RecapDialog — the "session recap card" shown after you leave a room:
 * a shareable summary of your visit (time, messages, hearts, cheers, songs)
 * with one-tap WhatsApp sharing. Pure celebration, no guilt trip.
 */

import { Clock, Heart, MessageCircle, Music, PartyPopper } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SessionRecap } from '@/hooks/use-room'

interface RecapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recap: SessionRecap | null
}

function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function RecapDialog({ open, onOpenChange, recap }: RecapDialogProps) {
  if (!recap) return null

  const share = () => {
    const parts = [
      '🎉 Just had a great hangout on DesiHangout!',
      `⏱ ${formatDuration(recap.durationMs)} in ${recap.roomName}`,
      `💬 ${recap.messages} messages · ❤️ ${recap.hearts} hearts · 👏 ${recap.awards} cheers${
        recap.songs > 0 ? ` · 🎵 ${recap.songs} songs` : ''
      }`,
      'Join me next time — no sign-up, just vibes!',
    ]
    const text = parts.join('\n')
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    const win = window.open(url, '_blank')
    if (!win) {
      try {
        void navigator.clipboard.writeText(text)
      } catch {}
    }
  }

  const stats: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <Clock className="h-4 w-4" />, label: 'time in room', value: formatDuration(recap.durationMs) },
    { icon: <MessageCircle className="h-4 w-4" />, label: 'messages', value: String(recap.messages) },
    { icon: <Heart className="h-4 w-4" />, label: 'hearts sent', value: String(recap.hearts) },
    { icon: <PartyPopper className="h-4 w-4" />, label: 'cheers given', value: String(recap.awards) },
    ...(recap.songs > 0
      ? [{ icon: <Music className="h-4 w-4" />, label: 'songs queued', value: String(recap.songs) }]
      : []),
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm rounded-2xl border-neutral-800 bg-[#141414] gap-4"
        data-testid="recap-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-white" data-testid="recap-title">
            🫶 That was fun!
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-400">
            Your {recap.roomName} session, by the numbers:
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2.5"
            >
              <span className="text-[#E50914]">{s.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-white">{s.value}</span>
                <span className="block truncate text-[10px] uppercase tracking-wider text-neutral-500">
                  {s.label}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={share}
            data-testid="recap-share"
            className="h-11 rounded-xl bg-[#25D366] font-black text-white hover:bg-[#1fb457]"
          >
            Share on WhatsApp
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            variant="ghost"
            data-testid="recap-close"
            className="h-9 rounded-xl text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
