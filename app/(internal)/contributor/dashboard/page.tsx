'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FileText, Shield, Play, Sparkles, ChevronRight, PlusCircle, Clock, AlertCircle } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { ContributorNav } from '@/components/layout/ContributorNav'
import { ApprovedSourcesModal } from '@/components/contributor/ApprovedSourcesModal'
import {
  getDisplayStatus,
  STATUS_CONFIG,
  SOURCE_TYPE_CONFIG,
  timeAgo,
  getGreeting,
  type RawItemWithSourceType,
} from '@/lib/contributor'

interface Stats {
  total: number
  published: number
  pending: number
}

function SourceIcon({ type, size = 14, className = '' }: { type: string; size?: number; className?: string }) {
  const props = { size, className }
  switch (type) {
    case 'blog': return <FileText {...props} />
    case 'official': return <Shield {...props} />
    case 'youtube': return <Play {...props} />
    case 'ai_tool': return <Sparkles {...props} />
    default: return <FileText {...props} />
  }
}

export default function ContributorDashboardPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [stats, setStats] = useState<Stats>({ total: 0, published: 0, pending: 0 })
  const [recentItems, setRecentItems] = useState<RawItemWithSourceType[]>([])
  const [spaceName, setSpaceName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showSourcesModal, setShowSourcesModal] = useState(false)

  useEffect(() => {
    if (sessionLoading || !currentUser) return

    async function load() {
      try {
        const supabase = createBrowserSupabaseClient()
        const userId = currentUser!.id
        const spaceId = currentUser!.space_id

        if (!spaceId) {
          setLoadError('Your account has no space assigned. Contact your Industry Admin.')
          return
        }

        const [
          { count: total },
          { count: published },
          { count: pending },
          { data: recent },
          { data: space },
        ] = await Promise.all([
          supabase
            .from('raw_items').select('*', { count: 'exact', head: true })
            .eq('submitted_by', userId).eq('space_id', spaceId),
          supabase
            .from('raw_items').select('*', { count: 'exact', head: true })
            .eq('submitted_by', userId).eq('space_id', spaceId).eq('status', 'processed'),
          supabase
            .from('raw_items').select('*', { count: 'exact', head: true })
            .eq('submitted_by', userId).eq('space_id', spaceId).in('status', ['pending', 'in_review']),
          supabase
            .from('raw_items').select('*')
            .eq('submitted_by', userId).eq('space_id', spaceId)
            .order('created_at', { ascending: false }).limit(5),
          supabase
            .from('industry_spaces').select('name')
            .eq('id', spaceId).single(),
        ])

        setStats({ total: total ?? 0, published: published ?? 0, pending: pending ?? 0 })
        setRecentItems((recent as RawItemWithSourceType[]) ?? [])
        setSpaceName(space?.name ?? null)
      } catch (err) {
        console.error('[Dashboard] unexpected error:', err)
        setLoadError('Unexpected error loading dashboard. See console for details.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionLoading, currentUser])

  const publicationRate = stats.total > 0
    ? Math.round((stats.published / stats.total) * 100)
    : 0
  const showRate = stats.total >= 5
  const firstName = currentUser?.name?.split(' ')[0] ?? 'there'
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // ─── Loading skeleton ──────────────────────────────────────────────────────
  if (sessionLoading || (loading && currentUser)) {
    return (
      <>
        <ContributorNav />
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="h-8 w-64 bg-gray-200 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mb-8" />
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
          <div className="grid grid-cols-2 gap-4 mb-8">
            {[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        </div>
      </>
    )
  }

  // Redirect in progress — useSession will push to /login
  if (!currentUser) return null

  // ─── Error state ───────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <>
        <ContributorNav />
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
      <ContributorNav />
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Welcome */}
        <h1 className="text-2xl font-bold text-slate-900">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-gray-500 mt-1 mb-8">
          {today}{spaceName && <> &middot; {spaceName} Space</>}
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 text-center">
            <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm text-gray-500 mt-1">Total Submissions</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 text-center">
            <p className="text-3xl font-bold text-green-600">{stats.published}</p>
            <p className="text-sm text-gray-500 mt-1">Published</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 text-center">
            <p className="text-3xl font-bold text-amber-500">{stats.pending}</p>
            <p className="text-sm text-gray-500 mt-1">Pending Review</p>
          </div>
        </div>

        {/* Publication rate */}
        {showRate && (
          <p className="text-sm text-gray-500 mb-6">
            Your publication rate:{' '}
            <span className="font-semibold text-slate-700">{publicationRate}%</span>
            {' '}&mdash;{' '}
            {publicationRate >= 50 ? 'Keep up the great work.' : 'Keep submitting — each quality submission improves your rate.'}
          </p>
        )}

        {/* All clear badge */}
        {stats.total > 0 && stats.pending === 0 && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-sm text-green-700 font-medium">
            All caught up — no pending submissions.
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Link
            href="/contributor/submit"
            className="flex items-center justify-center gap-2 bg-slate-900 text-white text-sm font-semibold py-3 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <PlusCircle size={16} />
            Submit New Content
          </Link>
          <Link
            href="/contributor/history"
            className="flex items-center justify-center gap-2 border-2 border-slate-900 text-slate-900 text-sm font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Clock size={16} />
            View My History
          </Link>
        </div>

        {/* Recent submissions */}
        <div className="mb-6">
          <h2 className="text-base font-semibold text-slate-800 mb-3">Recent Submissions</h2>

          {recentItems.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
              <p className="text-gray-500 text-sm mb-4">Ready to make your first submission?</p>
              <Link
                href="/contributor/submit"
                className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <PlusCircle size={14} />
                Submit Content
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentItems.map((item) => {
                const displayStatus = getDisplayStatus(item)
                const statusConf = STATUS_CONFIG[displayStatus]
                const srcType = item.source_type ?? 'other'
                const srcConf = SOURCE_TYPE_CONFIG[srcType] ?? SOURCE_TYPE_CONFIG.other
                const preview = item.raw_text.slice(0, 100).trimEnd()

                return (
                  <Link
                    key={item.id}
                    href={`/contributor/history/${item.id}`}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors group"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${srcConf.bgColor}`}>
                      <SourceIcon type={srcType} size={14} className={srcConf.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{preview}&hellip;</p>
                      <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${statusConf.bg} ${statusConf.text}`}>
                      {statusConf.label}
                    </span>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Approved sources reminder */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 text-sm text-gray-500">
          Remember to only submit from approved sources.{' '}
          <button
            onClick={() => setShowSourcesModal(true)}
            className="text-teal-600 hover:text-teal-700 underline font-medium"
          >
            View approved sources list
          </button>
        </div>

      </div>

      {showSourcesModal && currentUser?.space_id && (
        <ApprovedSourcesModal
          spaceId={currentUser.space_id}
          spaceName={spaceName}
          onClose={() => setShowSourcesModal(false)}
        />
      )}
    </>
  )
}
