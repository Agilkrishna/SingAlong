'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban, Heart, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessage } from '@/hooks/use-room'

interface ChatPanelProps {
  messages: ChatMessage[]
  myId: string
  onSend: (text: string) => void
  /** names blocked on this device — their messages stay hidden */
  blockedNames?: string[]
  onBlock?: (name: string) => void
  /** floating-heart action — renders a ❤️ button beside Send when given */
  onHeart?: () => void
}

export function ChatPanel({ messages, myId, onSend, blockedNames = [], onBlock, onHeart }: ChatPanelProps) {
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // hide messages from blocked names (system messages always stay)
  const visible = useMemo(() => {
    if (blockedNames.length === 0) return messages
    const blocked = new Set(blockedNames)
    return messages.filter((m) => m.type === 'system' || !blocked.has((m.name ?? '').toLowerCase()))
  }, [messages, blockedNames])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visible])

  const send = () => {
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
  }

  return (
    <div className="flex h-full flex-col" data-testid="chat-panel">
      <div className="border-b border-neutral-800 px-4 py-3">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">Room Chat</h3>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 py-2">
        <div className="space-y-2 pr-2">
          {visible.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">
              Say hi — get the hangout going 👋
            </p>
          )}
          {visible.map((m) =>
            m.type === 'system' ? (
              <p
                key={m.id}
                className="rounded bg-neutral-800/40 px-2 py-1.5 text-center text-[11px] leading-snug text-neutral-400"
              >
                {m.text}
              </p>
            ) : (
              <div key={m.id} className="group flex gap-2">
                <span
                  className="mt-0.5 h-6 w-6 shrink-0 rounded-full text-center text-[10px] font-black leading-6 text-white"
                  style={{ backgroundColor: m.color ?? '#E50914' }}
                >
                  {m.avatar ?? (m.name ?? '?').slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold" style={{ color: m.color ?? '#fff' }}>
                    {m.name}
                    {m.from === myId && <span className="ml-1 font-normal text-neutral-500">(you)</span>}
                  </p>
                  <p className="break-words text-xs leading-snug text-neutral-200">{m.text}</p>
                </div>
                {/* block — never on your own messages; hidden messages are managed in People & safety */}
                {onBlock && m.from !== myId && (
                  <button
                    onClick={() => onBlock(m.name ?? '')}
                    aria-label={`Block ${m.name} — hide their messages on your device`}
                    title={`Block ${m.name}`}
                    data-testid={`block-btn-${(m.name ?? '').toLowerCase()}`}
                    className="mt-0.5 hidden h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-600 transition hover:bg-[#E50914]/20 hover:text-[#ff6b6b] group-hover:flex sm:flex sm:opacity-30 sm:hover:opacity-100"
                  >
                    <Ban className="h-3 w-3" />
                  </button>
                )}
              </div>
            ),
          )}
          {blockedNames.length > 0 && (
            <p className="pt-1 text-center text-[10px] text-neutral-600" data-testid="blocked-note">
              🚫 {blockedNames.length} blocked on this device — unblock from People &amp; safety
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="flex gap-2 border-t border-neutral-800 p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message…"
          maxLength={300}
          className="h-10 border-neutral-700 bg-neutral-800/80 text-sm text-white placeholder:text-neutral-500"
          data-testid="chat-input"
          aria-label="Chat message"
        />
        {onHeart && (
          <Button
            size="icon"
            variant="outline"
            onClick={onHeart}
            aria-label="Send love — floating hearts for the room"
            title="Send love ❤️"
            data-testid="heart-send"
            className="h-10 w-10 shrink-0 rounded-md border-neutral-700 bg-neutral-800/60 text-neutral-300 transition hover:border-[#E50914] hover:text-[#E50914]"
          >
            <Heart className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          onClick={send}
          disabled={!text.trim()}
          aria-label="Send message"
          className="h-10 w-10 shrink-0 rounded-md bg-[#E50914] hover:bg-[#F6121D] disabled:opacity-40"
          data-testid="chat-send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
