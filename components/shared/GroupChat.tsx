'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GroupMessage } from '@/types'
import { getGroupMessages, sendGroupMessage, deleteGroupMessage } from '@/services/sharedMessages'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Send, Trash2 } from 'lucide-react'
import { formatChatTime } from '@/utils/format'
import { toast } from 'sonner'

interface Props {
  groupId: string
  currentUserId: string
}

export function GroupChat({ groupId, currentUserId }: Props) {
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior })
  }, [])

  useEffect(() => {
    let mounted = true
    getGroupMessages(groupId)
      .then((msgs) => {
        if (!mounted) return
        setMessages(msgs)
        setIsLoading(false)
      })
      .catch(() => {
        if (mounted) setIsLoading(false)
      })
    return () => { mounted = false }
  }, [groupId])

  // Instant scroll on initial load; smooth scroll on new messages
  useEffect(() => {
    if (isLoading) return
    scrollToBottom('instant' as ScrollBehavior)
  }, [isLoading, scrollToBottom])

  useEffect(() => {
    if (messages.length === 0) return
    scrollToBottom()
  }, [messages.length, scrollToBottom])

  const handleDelete = async (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
    try {
      await deleteGroupMessage(id)
    } catch {
      toast.error('Failed to delete message')
      // Reload to restore state on failure
      getGroupMessages(groupId).then(setMessages).catch(() => null)
    }
  }

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'shared_group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const msg = payload.new as GroupMessage
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'shared_group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [groupId])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isSending) return
    setInput('')
    setIsSending(true)
    try {
      const msg = await sendGroupMessage(groupId, text)
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      )
    } catch {
      toast.error('Failed to send message')
      setInput(text)
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }

  // Group consecutive messages from the same sender
  const grouped = messages.reduce<{ msg: GroupMessage; showSender: boolean }[]>((acc, msg, i) => {
    const prev = messages[i - 1]
    const showSender = !prev || prev.user_id !== msg.user_id
    acc.push({ msg, showSender })
    return acc
  }, [])

  return (
    <div className="flex flex-col h-[calc(100svh-220px)] min-h-[380px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {isLoading ? (
          <div className="space-y-3 px-1 pt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                <Skeleton className={cn('h-9 rounded-2xl', i % 2 === 0 ? 'w-44' : 'w-36')} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <span className="text-3xl">💬</span>
            <p className="text-sm">No messages yet. Say hello!</p>
          </div>
        ) : (
          grouped.map(({ msg, showSender }, i) => {
            const isMe = msg.user_id === currentUserId
            const isLast = i === grouped.length - 1 || grouped[i + 1].msg.user_id !== msg.user_id
            return (
              <div
                key={msg.id}
                className={cn(
                  'flex flex-col px-1',
                  isMe ? 'items-end' : 'items-start',
                  showSender ? 'mt-3' : 'mt-0.5'
                )}
              >
                {showSender && !isMe && (
                  <span className="text-xs font-medium text-muted-foreground mb-1 ml-1">
                    {msg.user_email.split('@')[0]}
                  </span>
                )}
                <div className={cn('flex items-end gap-1.5', isMe ? 'flex-row-reverse' : 'flex-row')}>
                  <div
                    className={cn(
                      'max-w-[78%] px-3.5 py-2 text-sm leading-relaxed break-words',
                      isMe
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground',
                      isMe
                        ? isLast ? 'rounded-2xl rounded-br-md' : 'rounded-2xl'
                        : isLast ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl'
                    )}
                  >
                    {msg.message}
                  </div>
                  {isMe && (
                    <button
                      type="button"
                      onClick={() => handleDelete(msg.id)}
                      className="w-5 h-5 flex items-center justify-center rounded-md text-muted-foreground/40 hover:text-destructive transition-colors flex-shrink-0 mb-0.5"
                      aria-label="Delete message"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {isLast && (
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {formatChatTime(msg.created_at)}
                  </span>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 pt-3 border-t border-border"
      >
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 h-11 rounded-xl"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend(e as unknown as React.FormEvent)
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 rounded-xl flex-shrink-0"
          disabled={isSending || !input.trim()}
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  )
}
