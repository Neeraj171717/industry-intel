'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Flag, AlertCircle, CheckCircle, ChevronDown } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

interface ArticleRow {
  id: string
  headline: string
  content_type: string | null
  severity: string | null
  published_at: string | null
  author_name: string
  is_flagged: boolean
}

const CONTENT_TYPES = ['All', 'news', 'analysis', 'opinion', 'data']
const SEVERITIES = ['All', 'critical', 'high', 'medium', 'low']
const FLAG_REASONS = [
  'Factual error',
  'Inappropriate content',
  'Outdated information',
  'Other',
]

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function SeverityBadge({ value }: { value: string | null }) {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  }
  if (!value) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${map[value] ?? 'bg-gray-100 text-gray-600'}`}>
      {value}
    </span>
  )
}

function ContentTypeBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
      {value}
    </span>
  )
}

interface FlagModalProps {
  article: ArticleRow
  onClose: () => void
  onFlagged: (id: string) => void
  spaceId: string
  userId: string
}

function FlagModal({ article, onClose, onFlagged, spaceId, userId }: FlagModalProps) {
  const [reason, setReason] = useState(FLAG_REASONS[0])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true)
    setError(null)
    const { error: e } = await createBrowserSupabaseClient()
      .from('content_flags')
      .insert({
        space_id: spaceId,
        final_item_id: article.id,
        flagged_by: userId,
        reason,
        note: note.trim() || null,
        status: 'open',
      })
    setSaving(false)
    if (e) { setError('Failed to submit flag. Please try again.'); return }
    onFlagged(article.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Flag Article</h2>
        <p className="text-sm text-gray-500 mb-5 truncate">{article.headline}</p>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Reason <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-teal-300 pr-8"
              >
                {FLAG_REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Note (optional)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Provide additional context…"
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
            disabled={saving}
            className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? 'Submitting…' : 'Submit Flag'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ContentPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [severityFilter, setSeverityFilter] = useState('All')
  const [flagTarget, setFlagTarget] = useState<ArticleRow | null>(null)
  const [flagSuccessId, setFlagSuccessId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!currentUser) return
    setLoading(true)
    const supabase = createBrowserSupabaseClient()
    const spaceId = currentUser.space_id!

    const { data: items } = await supabase
      .from('final_items')
      .select('id, title, content_type, severity, published_at, author_id')
      .eq('space_id', spaceId)
      .order('published_at', { ascending: false })
      .limit(200)

    if (!items || items.length === 0) {
      setArticles([])
      setLoading(false)
      return
    }

    const userIds = Array.from(new Set<string>(items.map((i: Record<string, string>) => i.author_id).filter(Boolean)))
    const flaggedIds = new Set<string>()

    const [{ data: users }, { data: flags }] = await Promise.all([
      supabase.from('users').select('id, name').in('id', userIds),
      supabase.from('content_flags').select('final_item_id').eq('space_id', spaceId).eq('status', 'open'),
    ])

    const userMap = Object.fromEntries((users ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))
    ;(flags ?? []).forEach((f: { final_item_id: string }) => flaggedIds.add(f.final_item_id))

    setArticles(items.map((i: Record<string, string>) => ({
      id: i.id,
      headline: i.title,
      content_type: i.content_type,
      severity: i.severity,
      published_at: i.published_at,
      author_name: userMap[i.author_id] ?? 'Unknown',
      is_flagged: flaggedIds.has(i.id),
    })))
    setLoading(false)
  }, [currentUser])

  useEffect(() => {
    if (!sessionLoading && currentUser) load()
  }, [sessionLoading, currentUser, load])

  function handleFlagged(id: string) {
    setArticles(prev => prev.map(a => a.id === id ? { ...a, is_flagged: true } : a))
    setFlagSuccessId(id)
    setTimeout(() => setFlagSuccessId(null), 3000)
  }

  const filtered = articles.filter(a => {
    if (typeFilter !== 'All' && a.content_type !== typeFilter) return false
    if (severityFilter !== 'All' && a.severity !== severityFilter) return false
    if (search && !a.headline.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (sessionLoading || (loading && currentUser)) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!currentUser) return null

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Published Content</h1>
          <p className="text-sm text-gray-500 mt-0.5">{articles.length} published articles</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by headline…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none pr-7 focus:outline-none focus:ring-2 focus:ring-teal-300"
              >
                {CONTENT_TYPES.map(t => <option key={t}>{t === 'All' ? 'All Types' : t}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none pr-7 focus:outline-none focus:ring-2 focus:ring-teal-300"
              >
                {SEVERITIES.map(s => <option key={s}>{s === 'All' ? 'All Severities' : s}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">No articles match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Headline</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Type</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Severity</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Author</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Published</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(article => (
                  <tr key={article.id} className={`hover:bg-gray-50 transition-colors ${article.is_flagged ? 'bg-red-50/40' : ''}`}>
                    <td className="px-5 py-3.5 max-w-xs">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800 truncate">{article.headline}</p>
                        {article.is_flagged && (
                          <Flag size={12} className="text-red-500 flex-shrink-0" fill="currentColor" />
                        )}
                      </div>
                      {flagSuccessId === article.id && (
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-teal-600">
                          <CheckCircle size={11} /> Flag submitted
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <ContentTypeBadge value={article.content_type} />
                    </td>
                    <td className="px-3 py-3.5">
                      <SeverityBadge value={article.severity} />
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="text-sm text-gray-600">{article.author_name}</p>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="text-xs text-gray-400">
                        {article.published_at ? timeAgo(article.published_at) : '—'}
                      </p>
                    </td>
                    <td className="px-3 py-3.5">
                      {!article.is_flagged && (
                        <button
                          onClick={() => setFlagTarget(article)}
                          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                        >
                          <Flag size={12} />
                          Flag
                        </button>
                      )}
                      {article.is_flagged && (
                        <span className="text-xs text-red-400 font-medium">Flagged</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {flagTarget && (
        <FlagModal
          article={flagTarget}
          onClose={() => setFlagTarget(null)}
          onFlagged={handleFlagged}
          spaceId={currentUser.space_id!}
          userId={currentUser.id}
        />
      )}
    </div>
  )
}
