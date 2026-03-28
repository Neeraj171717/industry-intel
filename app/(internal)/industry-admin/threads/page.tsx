'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, AlertCircle, CheckCircle } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

interface ThreadRow {
  id: string
  title: string
  description: string | null
  status: string
  created_at: string
  created_by: string
  creator_name: string
  article_count: number
  last_activity: string | null
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
  spaceId: string
  userId: string
}

function CreateModal({ onClose, onCreated, spaceId, userId }: CreateModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (title.trim().length < 2) { setError('Title must be at least 2 characters.'); return }
    setSaving(true)
    setError(null)
    const { error: e } = await createBrowserSupabaseClient()
      .from('event_threads')
      .insert({
        space_id: spaceId,
        title: title.trim(),
        description: description.trim() || null,
        status: 'active',
        created_by: userId,
      })
    setSaving(false)
    if (e) { setError('Failed to create thread. Please try again.'); return }
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-5">New Thread</h2>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Q1 Earnings Season 2025"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Briefly describe what this thread covers…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || title.trim().length < 2}
            className="flex-1 bg-teal-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Thread'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface DeactivateModalProps {
  thread: ThreadRow
  onClose: () => void
  onDeactivated: (id: string) => void
}

function DeactivateModal({ thread, onClose, onDeactivated }: DeactivateModalProps) {
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    await createBrowserSupabaseClient()
      .from('event_threads')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    setSaving(false)
    onDeactivated(thread.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Deactivate Thread?</h2>
        <p className="text-sm text-gray-600 mb-2">
          Are you sure you want to deactivate <span className="font-semibold">{thread.title}</span>?
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Deactivated threads are hidden from contributors and end users. You can reactivate at any time.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={saving}
            className="flex-1 bg-slate-800 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-900 disabled:opacity-50"
          >
            {saving ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ThreadsPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<ThreadRow | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!currentUser) return
    setLoading(true)
    const supabase = createBrowserSupabaseClient()
    const spaceId = currentUser.space_id!

    const { data: rawThreads } = await supabase
      .from('event_threads')
      .select('id, title, description, status, created_at, created_by, updated_at')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })

    if (!rawThreads || rawThreads.length === 0) {
      setThreads([])
      setLoading(false)
      return
    }

    const threadIds = rawThreads.map((t: any) => t.id)
    const userIds = [...new Set(rawThreads.map((t: any) => t.created_by).filter(Boolean))]

    const [{ data: items }, { data: users }] = await Promise.all([
      supabase
        .from('final_items')
        .select('event_thread_id, published_at')
        .eq('space_id', spaceId)
        .in('event_thread_id', threadIds)
        .eq('status', 'published'),
      supabase.from('users').select('id, full_name').in('id', userIds),
    ])

    const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u.full_name]))

    const countMap: Record<string, number> = {}
    const lastMap: Record<string, string> = {}
    ;(items ?? []).forEach((i: any) => {
      countMap[i.event_thread_id] = (countMap[i.event_thread_id] ?? 0) + 1
      if (!lastMap[i.event_thread_id] || i.published_at > lastMap[i.event_thread_id]) {
        lastMap[i.event_thread_id] = i.published_at
      }
    })

    setThreads(rawThreads.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      created_at: t.created_at,
      created_by: t.created_by,
      creator_name: userMap[t.created_by] ?? 'Unknown',
      article_count: countMap[t.id] ?? 0,
      last_activity: lastMap[t.id] ?? null,
    })))
    setLoading(false)
  }, [currentUser])

  useEffect(() => {
    if (!sessionLoading && currentUser) load()
  }, [sessionLoading, currentUser, load])

  async function toggleStatus(thread: ThreadRow) {
    if (thread.status === 'active') {
      setDeactivateTarget(thread)
      return
    }
    // Reactivate directly
    setTogglingId(thread.id)
    await createBrowserSupabaseClient()
      .from('event_threads')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, status: 'active' } : t))
    setTogglingId(null)
    setSuccessId(thread.id)
    setTimeout(() => setSuccessId(null), 2500)
  }

  function handleDeactivated(id: string) {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, status: 'inactive' } : t))
  }

  const active = threads.filter(t => t.status === 'active')
  const inactive = threads.filter(t => t.status === 'inactive')

  if (sessionLoading || (loading && currentUser)) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!currentUser) return null

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Event Threads</h1>
          <p className="text-sm text-gray-500 mt-0.5">{active.length} active · {inactive.length} inactive</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-teal-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-teal-700"
        >
          <Plus size={16} />
          New Thread
        </button>
      </div>

      {threads.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-sm">No threads yet. Create one to organise related articles.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Active</h2>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-50">
                {active.map(thread => (
                  <ThreadRowItem
                    key={thread.id}
                    thread={thread}
                    toggling={togglingId === thread.id}
                    success={successId === thread.id}
                    onToggle={toggleStatus}
                  />
                ))}
              </div>
            </div>
          )}

          {inactive.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Inactive</h2>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-50 opacity-70">
                {inactive.map(thread => (
                  <ThreadRowItem
                    key={thread.id}
                    thread={thread}
                    toggling={togglingId === thread.id}
                    success={successId === thread.id}
                    onToggle={toggleStatus}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={load}
          spaceId={currentUser.space_id!}
          userId={currentUser.id}
        />
      )}

      {deactivateTarget && (
        <DeactivateModal
          thread={deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
          onDeactivated={handleDeactivated}
        />
      )}
    </div>
  )
}

function ThreadRowItem({
  thread,
  toggling,
  success,
  onToggle,
}: {
  thread: ThreadRow
  toggling: boolean
  success: boolean
  onToggle: (t: ThreadRow) => void
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800 truncate">{thread.title}</p>
          {success && (
            <div className="flex items-center gap-1 text-xs text-teal-600">
              <CheckCircle size={11} /> Reactivated
            </div>
          )}
        </div>
        {thread.description && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{thread.description}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          Created by {thread.creator_name} · {timeAgo(thread.created_at)}
        </p>
      </div>

      <div className="flex items-center gap-6 flex-shrink-0">
        <div className="text-center">
          <p className="text-lg font-bold text-slate-800">{thread.article_count}</p>
          <p className="text-xs text-gray-400">articles</p>
        </div>
        <div className="text-center min-w-[80px]">
          <p className="text-xs text-gray-500">Last activity</p>
          <p className="text-xs font-medium text-slate-700 mt-0.5">
            {thread.last_activity ? timeAgo(thread.last_activity) : '—'}
          </p>
        </div>
        <button
          onClick={() => onToggle(thread)}
          disabled={toggling}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
            thread.status === 'active'
              ? 'border border-gray-200 text-gray-500 hover:bg-gray-50'
              : 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100'
          }`}
        >
          {toggling ? '…' : thread.status === 'active' ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>
    </div>
  )
}
