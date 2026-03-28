'use client'

import { useState, useEffect, useMemo } from 'react'
import { AlertCircle, Plus, ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { EditorNav } from '@/components/layout/EditorNav'
import { timeAgo, SEVERITY_CONFIG, CONTENT_TYPE_CONFIG } from '@/lib/editor'
import type { EventThread, FinalItem } from '@/types'

type ThreadFilter = 'active' | 'inactive' | 'all'

interface ThreadWithCount extends EventThread {
  article_count: number
}

interface ThreadArticle extends FinalItem {
  tag_names?: string[]
}

// ─── Create Thread Modal ───────────────────────────────────────────────────────
function CreateThreadModal({
  onConfirm,
  onCancel,
  saving,
}: {
  onConfirm: (title: string, description: string) => void
  onCancel: () => void
  saving: boolean
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Create New Thread</h2>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Thread Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. EU AI Act Developments"
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Description <span className="font-normal text-gray-400 normal-case">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What is this thread tracking?"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(title, description)}
            disabled={saving || title.trim().length < 2}
            className="flex-1 bg-slate-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Thread'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ThreadsPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [threads, setThreads] = useState<ThreadWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ThreadFilter>('active')
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null)
  const [threadArticles, setThreadArticles] = useState<Record<string, ThreadArticle[]>>({})
  const [loadingArticles, setLoadingArticles] = useState<Set<string>>(new Set())
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [savingThread, setSavingThread] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    if (sessionLoading || !currentUser) return
    loadThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, currentUser])

  async function loadThreads() {
    try {
      setLoading(true)
      setLoadError(null)
      const supabase = createBrowserSupabaseClient()
      const spaceId = currentUser!.space_id

      if (!spaceId) {
        setLoadError('No space assigned to your account.')
        return
      }

      const { data: threadData, error: threadError } = await supabase
        .from('event_threads')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })

      if (threadError) throw threadError

      const threadList = (threadData as EventThread[]) ?? []

      // Fetch article counts for all threads
      const threadIds = threadList.map((t) => t.id)
      let countMap: Record<string, number> = {}

      if (threadIds.length > 0) {
        const { data: countData } = await supabase
          .from('final_items')
          .select('thread_id')
          .in('thread_id', threadIds)
          .eq('space_id', spaceId)

        countMap = ((countData as { thread_id: string }[]) ?? []).reduce<Record<string, number>>(
          (acc, row) => {
            acc[row.thread_id] = (acc[row.thread_id] ?? 0) + 1
            return acc
          },
          {}
        )
      }

      const threadsWithCount: ThreadWithCount[] = threadList.map((t) => ({
        ...t,
        article_count: countMap[t.id] ?? 0,
      }))

      setThreads(threadsWithCount)
    } catch (err) {
      console.error('[Threads] load error:', err)
      setLoadError('Failed to load threads.')
    } finally {
      setLoading(false)
    }
  }

  async function toggleThreadStatus(thread: ThreadWithCount) {
    const newStatus = thread.status === 'active' ? 'inactive' : 'active'
    setTogglingId(thread.id)
    try {
      const res = await fetch('/api/editor/threads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: thread.id, status: newStatus }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Toggle failed')

      setThreads((prev) =>
        prev.map((t) =>
          t.id === thread.id
            ? { ...t, status: newStatus, updated_at: new Date().toISOString() }
            : t
        )
      )
    } catch (err) {
      console.error('[Threads] toggle error:', err)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleCreateThread(title: string, description: string) {
    setSavingThread(true)
    try {
      const res = await fetch('/api/editor/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: description || null }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Create failed')

      const newThread: ThreadWithCount = { ...data.thread, article_count: 0 }
      setThreads((prev) => [newThread, ...prev])
      setShowCreateModal(false)
    } catch (err) {
      console.error('[Threads] create error:', err)
    } finally {
      setSavingThread(false)
    }
  }

  async function loadThreadArticles(threadId: string) {
    if (threadArticles[threadId]) return
    setLoadingArticles((prev) => new Set(Array.from(prev).concat(threadId)))

    try {
      const supabase = createBrowserSupabaseClient()
      const { data } = await supabase
        .from('final_items')
        .select(`*, article_tags(tags(name))`)
        .eq('thread_id', threadId)
        .eq('space_id', currentUser!.space_id)
        .order('published_at', { ascending: false })

      type RawThreadArticle = {
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
        article_tags: Array<{ tags: { name: string } | null }>
      }
      const built: ThreadArticle[] = ((data as unknown as RawThreadArticle[]) ?? []).map((item) => ({
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
        tag_names: item.article_tags?.map((at) => at.tags?.name ?? '').filter(Boolean) ?? [],
      }))

      setThreadArticles((prev) => ({ ...prev, [threadId]: built }))
    } catch (err) {
      console.error('[Threads] load articles error:', err)
    } finally {
      setLoadingArticles((prev) => {
        const next = new Set(prev)
        next.delete(threadId)
        return next
      })
    }
  }

  function handleExpandThread(threadId: string) {
    if (expandedThreadId === threadId) {
      setExpandedThreadId(null)
    } else {
      setExpandedThreadId(threadId)
      loadThreadArticles(threadId)
    }
  }

  const filteredThreads = useMemo(() => {
    if (filter === 'all') return threads
    return threads.filter((t) => t.status === filter)
  }, [threads, filter])

  const activeCount = threads.filter((t) => t.status === 'active').length

  // ─── Loading skeleton ────────────────────────────────────────────────────────
  if (sessionLoading || (loading && currentUser)) {
    return (
      <>
        <EditorNav />
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="h-7 w-40 bg-gray-200 rounded animate-pulse mb-6" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
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
          <p className="text-slate-800 font-semibold mb-2">Failed to load threads</p>
          <p className="text-sm text-gray-500 mb-6">{loadError}</p>
          <button onClick={loadThreads} className="text-sm border border-gray-300 rounded-lg px-5 py-2 hover:bg-gray-50">
            Retry
          </button>
        </div>
      </>
    )
  }

  const FILTER_TABS: { key: ThreadFilter; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'all', label: 'All' },
  ]

  return (
    <>
      <EditorNav />
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Event Threads
            {activeCount > 0 && (
              <span className="text-sm font-medium bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full">
                {activeCount} active
              </span>
            )}
          </h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <Plus size={15} />
            Create New Thread
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-6">
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-sm font-medium px-3.5 py-1.5 rounded-full transition-colors ${
                filter === key
                  ? 'bg-slate-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Threads list */}
        {filteredThreads.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <BookOpen size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">
              {filter === 'active' ? 'No active threads.' : filter === 'inactive' ? 'No inactive threads.' : 'No threads yet.'}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800"
            >
              <Plus size={14} />
              Create Thread
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredThreads.map((thread) => {
              const isExpanded = expandedThreadId === thread.id
              const articles = threadArticles[thread.id] ?? []
              const isLoadingArticles = loadingArticles.has(thread.id)

              return (
                <div key={thread.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-slate-900">{thread.title}</h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                            thread.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {thread.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                          {thread.article_count > 0 && (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex-shrink-0">
                              {thread.article_count} article{thread.article_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {thread.description && (
                          <p className="text-xs text-gray-400 mb-1 line-clamp-2">{thread.description}</p>
                        )}
                        <p className="text-xs text-gray-400">Updated {timeAgo(thread.updated_at)}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => toggleThreadStatus(thread)}
                          disabled={togglingId === thread.id}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                            thread.status === 'active'
                              ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
                              : 'border-green-200 text-green-700 hover:bg-green-50'
                          }`}
                        >
                          {togglingId === thread.id
                            ? '…'
                            : thread.status === 'active'
                            ? 'Deactivate'
                            : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleExpandThread(thread.id)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronUp size={15} className="text-gray-400" />
                          ) : (
                            <ChevronDown size={15} className="text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded articles */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      {isLoadingArticles ? (
                        <div className="px-5 py-4 space-y-2">
                          {[1, 2].map((i) => (
                            <div key={i} className="h-14 bg-gray-200 rounded animate-pulse" />
                          ))}
                        </div>
                      ) : articles.length === 0 ? (
                        <div className="px-5 py-4 text-center">
                          <p className="text-xs text-gray-400">No articles linked to this thread yet.</p>
                        </div>
                      ) : (
                        <div className="px-5 py-3 space-y-2">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                            Articles in this thread
                          </p>
                          {articles.map((article) => {
                            const sevCfg = SEVERITY_CONFIG[article.severity ?? 'medium'] ?? SEVERITY_CONFIG.medium
                            const ctLabel = CONTENT_TYPE_CONFIG[article.content_type ?? ''] ?? ''

                            return (
                              <div
                                key={article.id}
                                className="bg-white border border-gray-200 rounded-lg px-4 py-3"
                              >
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sevCfg.bg} ${sevCfg.text}`}>
                                        {sevCfg.label}
                                      </span>
                                      {ctLabel && (
                                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                          {ctLabel}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm font-medium text-slate-800 line-clamp-1">{article.title}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(article.published_at)}</p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>

      {showCreateModal && (
        <CreateThreadModal
          onConfirm={handleCreateThread}
          onCancel={() => setShowCreateModal(false)}
          saving={savingThread}
        />
      )}
    </>
  )
}
