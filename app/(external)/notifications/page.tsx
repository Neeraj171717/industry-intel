'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { EndUserNav } from '@/components/layout/EndUserNav'

interface Notification {
  id: string
  type: 'critical' | 'thread_update' | 'account'
  headline: string
  subtext: string
  article_id: string | null
  timestamp: string
  read: boolean
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const TYPE_CONFIG = {
  critical:     { label: 'Breaking',      badgeClass: 'bg-[#E84C4C]/20 text-[#E84C4C]' },
  thread_update:{ label: 'Thread Update', badgeClass: 'bg-[#00C2A8]/20 text-[#00C2A8]' },
  account:      { label: 'Account',       badgeClass: 'bg-[#8899AA]/20 text-[#8899AA]' },
}

export default function NotificationsPage() {
  const { user, loading: sessionLoading } = useSession({ required: true })
  const router = useRouter()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading]             = useState(true)
  const [readIds, setReadIds]             = useState<Set<string>>(new Set())

  const loadNotifications = useCallback(async () => {
    if (!user?.space_id) return
    setLoading(true)
    try {
      const supabase = createBrowserSupabaseClient()

      // Derive notifications from:
      // 1. Critical articles in user's space (last 30 days)
      // 2. Thread updates for threads user has read

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

      const [criticalResult, interactionResult] = await Promise.all([
        // Critical articles
        supabase
          .from('final_items')
          .select('id, title, published_at, thread_id')
          .eq('space_id', user.space_id)
          .eq('severity', 'critical')
          .gte('published_at', thirtyDaysAgo)
          .order('published_at', { ascending: false })
          .limit(20),
        // User's read thread IDs
        supabase
          .from('user_interactions')
          .select('thread_id, final_item_id, interacted_at')
          .eq('user_id', user.id)
          .eq('action', 'read')
          .not('thread_id', 'is', null),
      ])

      const interactionRows = (interactionResult.data ?? []) as Array<{ thread_id: string | null; final_item_id: string }>
      const readThreadIds = new Set(
        interactionRows.map(r => r.thread_id).filter(Boolean) as string[]
      )
      const readArticleIds = new Set(
        interactionRows.map(r => r.final_item_id)
      )

      const items: Notification[] = []

      // Critical notifications
      for (const article of criticalResult.data ?? []) {
        items.push({
          id:         `critical-${article.id}`,
          type:       'critical',
          headline:   article.title,
          subtext:    'Critical alert for your industry space',
          article_id: article.id,
          timestamp:  article.published_at,
          read:       readArticleIds.has(article.id),
        })
      }

      // Thread update notifications — fetch thread articles for threads user has read
      if (readThreadIds.size > 0) {
        const { data: threadArticles } = await supabase
          .from('final_items')
          .select('id, title, published_at, thread_id, event_threads(title)')
          .eq('space_id', user.space_id)
          .in('thread_id', Array.from(readThreadIds))
          .gte('published_at', thirtyDaysAgo)
          .not('id', 'in', `(${Array.from(readArticleIds).join(',') || 'null'})`)
          .order('published_at', { ascending: false })
          .limit(20)

        for (const article of threadArticles ?? []) {
          const thread = article.event_threads as { title: string } | null
          items.push({
            id:         `thread-${article.id}`,
            type:       'thread_update',
            headline:   article.title,
            subtext:    thread ? `Update to: ${thread.title}` : 'Thread update',
            article_id: article.id,
            timestamp:  article.published_at,
            read:       false,
          })
        }
      }

      // Sort by timestamp descending
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setNotifications(items)
    } catch (err) {
      console.error('[NotificationsPage]', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!sessionLoading && user) loadNotifications()
  }, [sessionLoading, user, loadNotifications])

  const handleTap = useCallback((n: Notification) => {
    setReadIds(prev => new Set([...Array.from(prev), n.id]))
    if (n.article_id) {
      router.push(`/feed/article/${n.article_id}`)
    }
  }, [router])

  const markAllRead = useCallback(() => {
    setReadIds(new Set(notifications.map(n => n.id)))
  }, [notifications])

  const unreadCount = notifications.filter(n => !n.read && !readIds.has(n.id)).length

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex flex-col max-w-[430px] mx-auto">
        <header className="flex items-center justify-between px-4 h-14 border-b border-[#1A2030]">
          <div className="h-5 w-32 bg-[#161B22] rounded animate-pulse" />
          <div className="h-4 w-20 bg-[#161B22] rounded animate-pulse" />
        </header>
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-[#161B22] rounded-xl p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#1E2530] rounded-full mt-1.5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-[#1E2530] rounded w-3/4" />
                  <div className="h-3 bg-[#1E2530] rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <EndUserNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col max-w-[430px] mx-auto">

      {/* Header */}
      <header className="flex items-center justify-between px-4 h-14 bg-[#0D1117] border-b border-[#1A2030] sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="p-1.5 -ml-1.5 text-[#888888]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-white font-bold text-[18px]">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-[#E84C4C] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-[13px] text-[#444D5A] font-medium">
            Mark all read
          </button>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 pb-[72px]">

        {/* Empty state */}
        {notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
            <div className="w-16 h-16 bg-[#161B22] rounded-2xl flex items-center justify-center mb-5 border border-[#1E2530]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#444D5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <h2 className="text-white font-bold text-[20px] mb-2">No notifications yet</h2>
            <p className="text-[#444D5A] text-[14px] leading-relaxed">
              Critical alerts and thread updates will appear here.
            </p>
          </div>
        )}

        {/* Notification list */}
        {notifications.length > 0 && (
          <div className="px-4 pt-3 space-y-2">
            {notifications.map(n => {
              const isRead = n.read || readIds.has(n.id)
              const cfg = TYPE_CONFIG[n.type]
              return (
                <button
                  key={n.id}
                  onClick={() => handleTap(n)}
                  className={`w-full text-left bg-[#161B22] rounded-xl p-4 border transition-colors ${
                    isRead ? 'border-[#1A2030]' : 'border-[#2C3444]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Unread dot */}
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 transition-colors ${
                      isRead ? 'bg-transparent' : 'bg-white'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cfg.badgeClass}`}>
                          {cfg.label}
                        </span>
                        <span className="text-[11px] text-[#444D5A]">{timeAgo(n.timestamp)}</span>
                      </div>
                      <p className={`text-[14px] font-medium leading-snug line-clamp-2 ${isRead ? 'text-[#888888]' : 'text-white'}`}>
                        {n.headline}
                      </p>
                      <p className="text-[12px] text-[#444D5A] mt-0.5">{n.subtext}</p>
                    </div>

                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2C3444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <EndUserNav />
    </div>
  )
}
