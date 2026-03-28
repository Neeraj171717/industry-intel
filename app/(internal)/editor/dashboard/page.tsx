'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle, Inbox, BookOpen, Calendar, Sparkles, ChevronRight } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { EditorNav } from '@/components/layout/EditorNav'
import { getGreeting, timeAgo, CONTENT_TYPE_CONFIG, SEVERITY_CONFIG } from '@/lib/editor'
import type { FinalItem } from '@/types'

interface DashboardStats {
  pendingInInbox: number
  publishedToday: number
  publishedThisWeek: number
  totalTagSuggestions: number
  acceptedTagSuggestions: number
  hasSuggestions: boolean
}

export default function EditorDashboardPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [stats, setStats] = useState<DashboardStats>({
    pendingInInbox: 0,
    publishedToday: 0,
    publishedThisWeek: 0,
    totalTagSuggestions: 0,
    acceptedTagSuggestions: 0,
    hasSuggestions: false,
  })
  const [recentPublished, setRecentPublished] = useState<FinalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionLoading || !currentUser) return

    async function load() {
      try {
        const supabase = createBrowserSupabaseClient()
        const spaceId = currentUser!.space_id
        const editorId = currentUser!.id

        if (!spaceId) {
          setLoadError('Your account has no space assigned. Contact your Industry Admin.')
          setLoading(false)
          return
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayIso = today.toISOString()

        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const weekAgoIso = weekAgo.toISOString()

        // Fetch raw item IDs for this space first — needed for ai_suggestions queries
        const { data: spaceRawItems } = await supabase
          .from('raw_items')
          .select('id')
          .eq('space_id', spaceId)
        const spaceRawItemIds = (spaceRawItems ?? []).map((r: { id: string }) => r.id)

        const [
          { count: pendingInInbox },
          { count: publishedToday },
          { count: publishedThisWeek },
          { count: totalTagSuggestions },
          { count: acceptedTagSuggestions },
          { data: recent },
        ] = await Promise.all([
          supabase
            .from('raw_items')
            .select('*', { count: 'exact', head: true })
            .eq('space_id', spaceId)
            .eq('status', 'pending')
            .eq('ai_processed', true),
          supabase
            .from('final_items')
            .select('*', { count: 'exact', head: true })
            .eq('author_id', editorId)
            .gte('published_at', todayIso),
          supabase
            .from('final_items')
            .select('*', { count: 'exact', head: true })
            .eq('author_id', editorId)
            .gte('published_at', weekAgoIso),
          spaceRawItemIds.length > 0
            ? supabase
                .from('ai_suggestions')
                .select('id', { count: 'exact', head: true })
                .eq('suggestion_type', 'tag')
                .in('raw_item_id', spaceRawItemIds)
            : Promise.resolve({ count: 0, data: null, error: null }),
          spaceRawItemIds.length > 0
            ? supabase
                .from('ai_suggestions')
                .select('id', { count: 'exact', head: true })
                .eq('suggestion_type', 'tag')
                .eq('accepted', true)
                .in('raw_item_id', spaceRawItemIds)
            : Promise.resolve({ count: 0, data: null, error: null }),
          supabase
            .from('final_items')
            .select('*')
            .eq('space_id', spaceId)
            .order('published_at', { ascending: false })
            .limit(5),
        ])

        setStats({
          pendingInInbox: pendingInInbox ?? 0,
          publishedToday: publishedToday ?? 0,
          publishedThisWeek: publishedThisWeek ?? 0,
          totalTagSuggestions: totalTagSuggestions ?? 0,
          acceptedTagSuggestions: acceptedTagSuggestions ?? 0,
          hasSuggestions: spaceRawItemIds.length > 0 && (totalTagSuggestions ?? 0) > 0,
        })
        setRecentPublished((recent as FinalItem[]) ?? [])
      } catch (err) {
        console.error('[EditorDashboard] unexpected error:', err)
        setLoadError('Unexpected error loading dashboard.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionLoading, currentUser])

  const firstName = currentUser?.name?.split(' ')[0] ?? 'there'
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const tagAcceptanceRate = stats.totalTagSuggestions > 0
    ? Math.round((stats.acceptedTagSuggestions / stats.totalTagSuggestions) * 100)
    : 0
  const aiBrainHealthy = !stats.hasSuggestions || tagAcceptanceRate >= 70

  // ─── Loading skeleton ────────────────────────────────────────────────────────
  if (sessionLoading || (loading && currentUser)) {
    return (
      <>
        <EditorNav />
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="h-8 w-64 bg-gray-200 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mb-8" />
          <div className="h-12 bg-gray-100 rounded-xl animate-pulse mb-6" />
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
          <div className="h-20 bg-gray-100 rounded-xl animate-pulse mb-6" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        </div>
      </>
    )
  }

  if (!currentUser) return null

  // ─── Error state ─────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <>
        <EditorNav />
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
          <p className="text-slate-800 font-semibold mb-2">Could not load dashboard</p>
          <p className="text-sm text-gray-500 mb-6">{loadError}</p>
          <button
            onClick={() => { setLoadError(null); setLoading(true); window.location.reload() }}
            className="text-sm border border-gray-300 rounded-lg px-5 py-2 hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <EditorNav />
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Welcome */}
        <h1 className="text-2xl font-bold text-slate-900">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">{today}</p>

        {/* Urgency banner */}
        {stats.pendingInInbox > 0 ? (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center justify-between">
            <p className="text-sm text-amber-800 font-medium">
              You have {stats.pendingInInbox} item{stats.pendingInInbox !== 1 ? 's' : ''} waiting for review
            </p>
            <Link
              href="/editor/inbox"
              className="text-sm font-semibold text-amber-700 hover:text-amber-900 underline"
            >
              Review Inbox
            </Link>
          </div>
        ) : (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl px-5 py-3 flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700 font-medium">Your inbox is clear. Great work.</p>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 text-center">
            <p className="text-3xl font-bold text-amber-500">{stats.pendingInInbox}</p>
            <p className="text-xs text-gray-500 mt-1">Pending in Inbox</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 text-center">
            <p className="text-3xl font-bold text-green-600">{stats.publishedToday}</p>
            <p className="text-xs text-gray-500 mt-1">Published Today</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 text-center">
            <p className="text-3xl font-bold text-slate-900">{stats.publishedThisWeek}</p>
            <p className="text-xs text-gray-500 mt-1">This Week</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 text-center">
            <p className={`text-3xl font-bold ${aiBrainHealthy ? 'text-green-600' : 'text-amber-500'}`}>
              {aiBrainHealthy ? '●' : '●'}
            </p>
            <p className="text-xs text-gray-500 mt-1">AI Brain</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              aiBrainHealthy ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {aiBrainHealthy ? 'Active' : 'Warning'}
            </span>
          </div>
        </div>

        {/* AI Brain detail */}
        {stats.hasSuggestions && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-purple-500" />
              <span className="text-sm font-semibold text-slate-800">AI Brain Performance</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-36">Tag Acceptance Rate</span>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full ${tagAcceptanceRate >= 70 ? 'bg-green-500' : 'bg-amber-400'}`}
                  style={{ width: `${tagAcceptanceRate}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-700 w-10 text-right">{tagAcceptanceRate}%</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              AI Brain Active — {stats.acceptedTagSuggestions} of {stats.totalTagSuggestions} tag suggestions accepted
            </p>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Link
            href="/editor/inbox"
            className="flex items-center justify-center gap-2 bg-slate-900 text-white text-sm font-semibold py-3 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <Inbox size={16} />
            Review Inbox
          </Link>
          <Link
            href="/editor/threads"
            className="flex items-center justify-center gap-2 border-2 border-slate-900 text-slate-900 text-sm font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <BookOpen size={16} />
            Create New Thread
          </Link>
        </div>

        {/* Recent published */}
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-3">Recent Published Articles</h2>

          {recentPublished.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
              <Calendar size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No articles published yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentPublished.map((item) => {
                const contentTypeLabel = CONTENT_TYPE_CONFIG[item.content_type ?? ''] ?? item.content_type ?? ''
                const severityCfg = SEVERITY_CONFIG[item.severity ?? 'medium'] ?? SEVERITY_CONFIG.medium
                return (
                  <Link
                    key={item.id}
                    href={`/editor/published`}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.published_at)}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${severityCfg.bg} ${severityCfg.text}`}>
                      {severityCfg.label}
                    </span>
                    {contentTypeLabel && (
                      <span className="text-xs text-gray-500 flex-shrink-0 bg-gray-100 px-2 py-0.5 rounded-full">
                        {contentTypeLabel}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </>
  )
}
