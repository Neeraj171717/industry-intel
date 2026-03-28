'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { FileText, Shield, Play, Sparkles, ChevronRight, Search, PlusCircle, AlertCircle } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { ContributorNav } from '@/components/layout/ContributorNav'
import {
  getDisplayStatus,
  STATUS_CONFIG,
  SOURCE_TYPE_CONFIG,
  timeAgo,
  type RawItemWithSourceType,
  type DisplayStatus,
} from '@/lib/contributor'

type FilterTab = 'all' | 'pending' | 'ai_processing' | 'in_review' | 'published' | 'rejected'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'ai_processing', label: 'AI Processing' },
  { key: 'in_review', label: 'In Review' },
  { key: 'published', label: 'Published' },
  { key: 'rejected', label: 'Rejected' },
]

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

function matchesFilter(item: RawItemWithSourceType, filter: FilterTab): boolean {
  if (filter === 'all') return true
  return getDisplayStatus(item) === (filter as DisplayStatus)
}

const EMPTY_MESSAGES: Record<FilterTab, string> = {
  all: 'No submissions yet.',
  pending: 'No pending submissions.',
  ai_processing: 'No submissions currently being processed.',
  in_review: 'No submissions in review.',
  published: 'No published submissions yet.',
  rejected: 'No rejected submissions. You have a clean record.',
}

const PAGE_SIZE = 20

export default function ContributorHistoryPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [allItems, setAllItems] = useState<RawItemWithSourceType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'status'>('newest')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

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

        const { data } = await supabase
          .from('raw_items')
          .select('*')
          .eq('submitted_by', userId)
          .eq('space_id', spaceId)
          .order('created_at', { ascending: false })
          .limit(500)

        setAllItems((data as RawItemWithSourceType[]) ?? [])
      } catch (err) {
        console.error('[History] unexpected error:', err)
        setLoadError('Unexpected error loading history. See console for details.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionLoading, currentUser])

  const filterCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = {
      all: allItems.length,
      pending: 0, ai_processing: 0, in_review: 0, published: 0, rejected: 0,
    }
    for (const item of allItems) {
      const ds = getDisplayStatus(item)
      if (ds in counts) counts[ds as FilterTab]++
    }
    return counts
  }, [allItems])

  const filteredAndSorted = useMemo(() => {
    let items = allItems.filter((item) => matchesFilter(item, activeFilter))

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      items = items.filter(
        (item) =>
          item.raw_text.toLowerCase().includes(q) ||
          (item.notes?.toLowerCase().includes(q) ?? false) ||
          (item.source_url?.toLowerCase().includes(q) ?? false),
      )
    }

    if (sortOrder === 'newest') {
      items = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))
    } else if (sortOrder === 'oldest') {
      items = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at))
    } else {
      const order: DisplayStatus[] = ['in_review', 'pending', 'ai_processing', 'published', 'rejected']
      items = [...items].sort((a, b) => order.indexOf(getDisplayStatus(a)) - order.indexOf(getDisplayStatus(b)))
    }

    return items
  }, [allItems, activeFilter, search, sortOrder])

  const visibleItems = filteredAndSorted.slice(0, page * PAGE_SIZE)
  const hasMore = visibleItems.length < filteredAndSorted.length

  if (sessionLoading || (loading && currentUser)) {
    return (
      <>
        <ContributorNav />
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-9 w-24 bg-gray-100 rounded-full animate-pulse" />)}
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        </div>
      </>
    )
  }

  // Redirect in progress — useSession will push to /login
  if (!currentUser) return null

  if (loadError) {
    return (
      <>
        <ContributorNav />
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
          <p className="text-slate-800 font-semibold mb-2">Could not load submissions</p>
          <p className="text-sm text-gray-500 mb-6">{loadError}</p>
          <button onClick={() => window.location.reload()} className="text-sm border border-gray-300 rounded-lg px-5 py-2 hover:bg-gray-50">
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

        <div className="flex items-baseline gap-3 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">My Submissions</h1>
          <span className="text-sm text-gray-400">{allItems.length} total</span>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {FILTER_TABS.map(({ key, label }) => {
            const count = filterCounts[key]
            const isActive = activeFilter === key
            return (
              <button
                key={key}
                onClick={() => { setActiveFilter(key); setPage(1); setSearch('') }}
                className={`text-sm font-medium px-3.5 py-1.5 rounded-full transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'border border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`ml-1.5 text-xs ${isActive ? 'text-slate-300' : 'text-gray-400'}`}>
                    ({count})
                  </span>
                )}
              </button>
            )
          })}
          <div className="ml-auto">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="status">By Status</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search your submissions..."
            className="w-full h-10 pl-10 pr-4 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
        </div>

        {/* Empty state — no submissions at all */}
        {allItems.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <p className="text-gray-500 text-sm mb-4">No submissions yet.</p>
            <Link
              href="/contributor/submit"
              className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-slate-800"
            >
              <PlusCircle size={14} />
              Submit your first piece of content
            </Link>
          </div>
        )}

        {/* Empty state — filter returns nothing */}
        {allItems.length > 0 && filteredAndSorted.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
            <p className="text-gray-500 text-sm">
              {search.trim()
                ? 'No submissions match your search. Try different keywords.'
                : EMPTY_MESSAGES[activeFilter]}
            </p>
          </div>
        )}

        {/* List */}
        {filteredAndSorted.length > 0 && (
          <div className="space-y-2">
            {visibleItems.map((item) => {
              const displayStatus = getDisplayStatus(item)
              const statusConf = STATUS_CONFIG[displayStatus]
              const srcType = item.source_type ?? 'other'
              const srcConf = SOURCE_TYPE_CONFIG[srcType] ?? SOURCE_TYPE_CONFIG.other
              const preview = item.raw_text.slice(0, 100).trimEnd()
              const domain = item.source_url
                ? (() => { try { return new URL(item.source_url).hostname } catch { return item.source_url } })()
                : null

              return (
                <Link
                  key={item.id}
                  href={`/contributor/history/${item.id}`}
                  className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl px-4 py-4 hover:bg-gray-50 transition-colors group"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${srcConf.bgColor}`}>
                    <SourceIcon type={srcType} size={15} className={srcConf.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug">
                      {preview}&hellip;
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {domain && <span className="text-xs text-teal-600 truncate max-w-xs">{domain}</span>}
                      <span className="text-xs text-gray-400">{timeAgo(item.created_at)}</span>
                    </div>
                    {displayStatus === 'rejected' && item.notes && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                        Editor note: {item.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusConf.bg} ${statusConf.text}`}>
                      {statusConf.label}
                    </span>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-400" />
                  </div>
                </Link>
              )
            })}

            {hasMore && (
              <div className="pt-2 text-center">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="text-sm text-slate-700 font-medium border border-gray-300 rounded-lg px-6 py-2 hover:bg-gray-50"
                >
                  Load more ({filteredAndSorted.length - visibleItems.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
