'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { AppNotification } from '@/types'
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/services/notifications'
import { acceptContactRequest, declineContactRequest } from '@/services/contacts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { Bell, CheckCheck } from 'lucide-react'
import { formatRelativeTime } from '@/utils/format'

const TYPE_ICON: Record<string, string> = {
  chat_message:         '💬',
  group_invite:         '👥',
  permission_approved:  '✅',
  member_joined:        '👤',
  settlement_received:    '💸',
  settlement_confirmed:   '✅',
  settlement_rejected:    '❌',
  payment_source_pending: '💳',
  contact_request:         '🤝',
  personal_debt_created:   '🧾',
  credit_card_due:         '💳',
  credit_card_config:      '⚠️',
}

export function NotificationBell() {
  const { user } = useAuth()
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)

  const unreadCount = notifications.filter((n) => !n.is_read).length

  useEffect(() => {
    if (!user?.id) return
    getNotifications().then(setNotifications).catch(() => null)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    const channel = supabase
      .channel(`notifications-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as AppNotification, ...prev])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const handleClick = async (n: AppNotification) => {
    if (!n.is_read) {
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      )
      markNotificationRead(n.id).catch(() => null)
    }
    if (n.related_id) {
      setOpen(false)
      router.push(
        n.type === 'contact_request'
          ? '/shared/contacts'
          : n.type === 'personal_debt_created'
            ? '/balances'
            : n.type === 'credit_card_due'
              ? `/balances?tab=credit_cards&card=${n.related_id}`
              : n.type === 'credit_card_config'
                ? `/balances?tab=credit_cards&card=${n.related_id}`
                : `/shared/${n.related_id}`
      )
    }
  }

  const handleContactResponse = async (n: AppNotification, action: 'accept' | 'decline') => {
    if (!n.related_id) return
    try {
      if (action === 'accept') {
        await acceptContactRequest(n.related_id)
      } else {
        await declineContactRequest(n.related_id)
      }
      setNotifications((prev) => prev.filter((item) => item.id !== n.id))
      markNotificationRead(n.id).catch(() => null)
    } catch {
      // Keep the notification visible so the user can retry.
    }
  }

  const handleMarkAll = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    markAllNotificationsRead().catch(() => null)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="relative w-9 h-9 rounded-xl flex items-center justify-center hover:bg-accent transition-colors outline-none">
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-0.5 leading-none pointer-events-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0 rounded-2xl overflow-hidden" sideOffset={8}>
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-semibold text-sm">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-[340px] overflow-y-auto divide-y divide-border">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <Bell className="w-6 h-6 opacity-30" />
              <p className="text-sm">You're all caught up</p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors',
                  !n.is_read && 'bg-primary/5'
                )}
              >
                <span className="text-base flex-shrink-0 mt-0.5">
                  {TYPE_ICON[n.type] ?? '🔔'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium leading-tight truncate">{n.title}</p>
                    {!n.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{n.message}</p>
                  {n.type === 'contact_request' && n.title === 'Contact request' && (
                    <div className="flex gap-2 mt-2">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleContactResponse(n, 'accept')
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            handleContactResponse(n, 'accept')
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-[11px] font-semibold"
                      >
                        Accept
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleContactResponse(n, 'decline')
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            handleContactResponse(n, 'decline')
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-muted border border-border text-[11px] font-semibold text-muted-foreground"
                      >
                        Decline
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                    {formatRelativeTime(n.created_at)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
