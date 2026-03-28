'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, AlertCircle, Search, ChevronDown, BookOpen, Tag as TagIcon } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { EditorNav } from '@/components/layout/EditorNav'
import {
  timeAgo, SEVERITY_CONFIG, CONTENT_TYPE_CONFIG, type FinalItemWithDetails,
} from '@/lib/editor'

type DateFilter = 'all' | 'this_week' | 'this_month' | 'mine'
type SortOrder = 'newest' | 'oldest'

// ─── Article Detail Modal ──────────────────────────────────────────────────────
function ArticleDetailModal({
  article,
  onClose,
}: {
  article: FinalItemWithDetails
  onClose: () => void
}) {
  const sevCfg = SEVERITY_CONFIG[article.severity ?? 'medium'] ?? SEVERITY_CONFIG.medium
  const contentTypeLabel = CONTENT_TYPE_CONFIG[article.content_type ?? ''] ?? article.content_type ?? ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sevCfg.bg} ${sevCfg.text}`}>
                {sevCfg.label}
              </span>
              {contentTypeLabel && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                  {contentTypeLabel}
                </span>
              )}
              {article.thread_title && (
                <span className="text-xs bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full">
                  {article.thread_title}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900">{article.title}</h2>
            <p className="text-xs text-gray-400 mt-1">Published {timeAgo(article.published_at)}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {article.summary && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Summary</p>
              <p className="text-sm text-gray-700 leading-relaxed">{article.summary}</p>
            </div>
          )}

          <div className="prose prose-sm max-w-none">
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{article.body}</p>
          </div>

          {article.tag_names.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {article.tag_names.map((name) => (
                <span key={name} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PublishedPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [articles, setArticles] = useState<FinalItemWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<FinalItemWithDetails | null>(null)

  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (sessionLoading || !currentUser) return
    loadArticles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, currentUser])

  async function loadArticles() {
    try {
      setLoading(true)
      setLoadError(null)
      const supabase = createBrowserSupabaseClient()
      const spaceId = currentUser!.space_id

      if (!spaceId) {
        setLoadError('No space assigned to your account.')
        return
      }

      const { data, error } = await supabase
        .from('final_items')
        .select(`
          *,
          event_threads(title),
          article_tags(tags(name))
        `)
        .eq('space_id', spaceId)
        .order('published_at', { ascending: false })

      if (error) throw error

      type RawFinalItem = {
        id: string
        space_id: string
        raw_item_id: string | null
        thread_id: string | null
        author_id: string
        title: string
        summary: string
        body: string
        content_type: string | null
        severity: string | null
        locality: string | null
        impact: string | null
        status: string
        published_at: string
        created_at: string
        event_threads: { title: string } | null
        article_tags: Array<{ tags: { name: string } | null }>
      }
      const built: FinalItemWithDetails[] = ((data as unknown as RawFinalItem[]) ?? []).map((item) => ({
        id: item.id,
        space_id: item.space_id,
        raw_item_id: item.raw_item_id,
        thread_id: item.thread_id,
        author_id: item.author_id,
        title: item.title,
        summary: item.summary,
        body: item.body,
        content_type: item.content_type as import('@/types').ContentType | null,
        severity: item.severity as import('@/types').Severity | null,
        locality: item.locality as import('@/types').Locality | null,
        impact: item.impact as import('@/types').Impact | null,
        status: item.status,
        published_at: item.published_at,
        created_at: item.created_at,
        thread_title: item.event_threads?.title ?? null,
        tag_names: item.article_tags
          ?.map((at) => at.tags?.name ?? '')
          .filter(Boolean) ?? [],
      }))

      setArticles(built)
    } catch (err) {
      console.error('[Published] load error:', err)
      setLoadError('Failed to load published articles.')
    } finally {
      setLoading(false)
    }
  }

  const filteredArticles = useMemo(() => {
    let items = articles
    const now = new Date()

    if (dateFilter === 'this_week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      items = items.filter((a) => new Date(a.published_at) >= weekAgo)
    } else if (dateFilter === 'this_month') {
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      items = items.filter((a) => new Date(a.published_at) >= monthAgo)
    } else if (dateFilter === 'mine') {
      items = items.filter((a) => a.author_id === currentUser?.id)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q)
      )
    }

    return [...items].sort((a, b) => {
      if (sortOrder === 'newest') {
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      }
      return new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
    })
  }, [articles, dateFilter, searchQuery, sortOrder, currentUser])

  // ─── Loading skeleton ────────────────────────────────────────────────────────
  if (sessionLoading || (loading && currentUser)) {
    return (
      <>
        <EditorNav />
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="h-7 w-48 bg-gray-200 rounded animate-pulse mb-6" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        </div>
      </>
    )
  }

  if (!currentUser) return null

  if (loadError) {
    return (
      <>
        <EditorNav />
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
          <p className="text-slate-800 font-semibold mb-2">Failed to load articles</p>
          <p className="text-sm text-gray-500 mb-6">{loadError}</p>
          <button
            onClick={loadArticles}
            className="text-sm border border-gray-300 rounded-lg px-5 py-2 hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      </>
    )
  }

  const DATE_TABS: { key: DateFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'this_week', label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'mine', label: 'My Articles' },
  ]

  return (
    <>
      <EditorNav />
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-slate-900">
            Published Articles{' '}
            {articles.length > 0 && (
              <span className="text-base font-medium text-gray-400">({articles.length})</span>
            )}
          </h1>
          <div className="relative">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-slate-300 pr-7"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {/* Date filter tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {DATE_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setDateFilter(key)}
              className={`flex-shrink-0 text-sm font-medium px-3.5 py-1.5 rounded-full transition-colors ${
                dateFilter === key
                  ? 'bg-slate-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Articles list */}
        {filteredArticles.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <BookOpen size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {searchQuery || dateFilter !== 'all'
                ? 'No articles match your filters.'
                : 'No published articles yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredArticles.map((article) => {
              const sevCfg = SEVERITY_CONFIG[article.severity ?? 'medium'] ?? SEVERITY_CONFIG.medium
              const contentTypeLabel = CONTENT_TYPE_CONFIG[article.content_type ?? ''] ?? ''

              return (
                <button
                  key={article.id}
                  onClick={() => setSelectedArticle(article)}
                  className="w-full text-left bg-white border border-gray-200 rounded-xl px-5 py-4 hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Badges */}
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sevCfg.bg} ${sevCfg.text}`}>
                          {sevCfg.label}
                        </span>
                        {contentTypeLabel && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                            {contentTypeLabel}
                          </span>
                        )}
                        {article.thread_title && (
                          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                            {article.thread_title}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-slate-900 mb-1 group-hover:text-slate-700">
                        {article.title}
                      </h3>

                      {/* Summary */}
                      <p className="text-xs text-gray-500 line-clamp-2 mb-2">{article.summary}</p>

                      {/* Published info + tags */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">{timeAgo(article.published_at)}</span>
                        {article.tag_names.slice(0, 3).map((name) => (
                          <span key={name} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                            {name}
                          </span>
                        ))}
                        {article.tag_names.length > 3 && (
                          <span className="text-xs text-gray-400 flex items-center gap-0.5">
                            <TagIcon size={10} />
                            +{article.tag_names.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

      </div>

      {selectedArticle && (
        <ArticleDetailModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </>
  )
}
