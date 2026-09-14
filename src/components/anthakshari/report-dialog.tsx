'use client'

/**
 * Report dialog — pick a reason (optionally against a specific participant).
 * Server logs every report with room/user context for moderation.
 */

import { useState } from 'react'
import { Flag, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RoomSnapshot } from '@/hooks/use-room'

const REASONS = [
  'Abusive language',
  'Harassment or bullying',
  'Inappropriate video/content',
  'Spam or scam',
  'Something else',
]

interface ReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: RoomSnapshot
  myId: string
  onSubmit: (reason: string, targetName?: string) => void
  sending?: boolean
}

export function ReportDialog({ open, onOpenChange, room, myId, onSubmit, sending }: ReportDialogProps) {
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState('')
  const others = room.participants.filter((p) => p.id !== myId)

  const submit = () => {
    if (!reason) return
    onSubmit(reason, target || undefined)
    setReason('')
    setTarget('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm gap-4 rounded-2xl border-neutral-800 bg-[#141414]"
        data-testid="report-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black text-white">
            <Flag className="h-4 w-4 text-[#ff6b6b]" /> Report &ldquo;{room.name}&rdquo;
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-400">
            Reports are anonymous and go straight to the moderators with room context.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              data-testid={`report-reason-${r.toLowerCase().replace(/[^a-z]+/g, '-')}`}
              className={`rounded-lg border px-3 py-2 text-left text-xs font-bold transition ${
                reason === r
                  ? 'border-[#E50914] bg-[#E50914]/15 text-white'
                  : 'border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-600'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {others.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
              Against (optional)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {others.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setTarget((t) => (t === p.name ? '' : p.name))}
                  aria-pressed={target === p.name}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                    target === p.name
                      ? 'bg-[#E50914] text-white'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button
          onClick={submit}
          disabled={!reason || sending}
          data-testid="report-submit"
          className="h-10 rounded-md bg-[#E50914] font-black uppercase tracking-wide hover:bg-[#F6121D] disabled:opacity-40"
        >
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Flag className="mr-2 h-4 w-4" />}
          Send report
        </Button>
      </DialogContent>
    </Dialog>
  )
}
