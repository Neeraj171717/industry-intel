'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, AlertCircle, Globe, ExternalLink } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { timeAgo, SOURCE_TYPE_CONFIG, CREDIBILITY_CONFIG } from '@/lib/admin'
import type { Source } from '@/types'

type SourceType = 'blog' | 'official' | 'youtube' | 'ai_tool' | 'other'
const SOURCE_TYPES: SourceType[] = ['blog', 'official', 'youtube', 'ai_tool', 'other']

interface SourceWithCount extends Source { submissionCount: number; notes?: string | null }

// ─── Source Modal (Add / Edit) ────────────────────────────────────────────────
function SourceModal({
  source, spaceId, onSave, onClose,
}: {
  source: SourceWithCount | null
  spaceId: string
  onSave: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(source?.name ?? '')
  const [url, setUrl] = useState(source?.url ?? '')
  const [type, setType] = useState<SourceType>(source?.type as SourceType ?? 'blog')
  const [credibility, setCredibility] = useState(source?.credibility ?? 'medium')
  const [notes, setNotes] = useState(source?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim()) { setError('Source name is required'); return }
    if (!url.trim()) { setError('Source URL is required'); return }
    if (!url.startsWith('http')) { setError('URL must start with http:// or https://'); return }
    setSaving(true)
    setError(null)
    const supabase = createBrowserSupabaseClient()
    try {
      if (!source) {
        // Check duplicate URL
        const { data: existing } = await supabase
          .from('sources')
          .select('id, name')
          .eq('space_id', spaceId)
          .ilike('url', url.trim())
          .maybeSingle()
        if (existing) {
          setError(`This URL is already registered as "${existing.name}".`)
          setSaving(false)
          return
        }
        const { error: e } = await supabase.from('sources').insert({
          space_id: spaceId, name: name.trim(), url: url.trim(),
          type, credibility, notes: notes.trim() || null, status: 'active',
        })
        if (e) throw e
      } else {
        const { error: e } = await supabase
          .from('sources')
          .update({ name: name.trim(), url: url.trim(), type, credibility, notes: notes.trim() || null })
          .eq('id', source.id)
        if (e) throw e
      }
      onSave()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save source')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">{source ? 'Edit Source' : 'Add Source'}</h2>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Source Name <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Search Engine Land"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">URL <span className="text-red-500">*</span></label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Type <span className="text-red-500">*</span></label>
              <select value={type} onChange={e => setType(e.target.value as SourceType)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300">
                {SOURCE_TYPES.map(t => <option key={t} value={t}>{SOURCE_TYPE_CONFIG[t]?.label ?? t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Credibility</label>
              <select value={credibility} onChange={e => setCredibility(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Notes <span className="font-normal text-gray-400 normal-case">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Notes for your team about this source…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving} className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim() || !url.trim()}
            className="flex-1 bg-teal-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving…' : (source ? 'Save Changes' : 'Add Source')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SourcesPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [sources, setSources] = useState<SourceWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingSource, setEditingSource] = useState<SourceWithCount | null>(null)
  const [deletingSource, setDeletingSource] = useState<SourceWithCount | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    if (sessionLoading || !currentUser) return
    loadSources()
  }, [sessionLoading, currentUser])

  async function loadSources() {
    try {
      setLoading(true)
      setLoadError(null)
      const supabase = createBrowserSupabaseClient()
      const spaceId = currentUser!.space_id!

      const [{ data: sourcesData }, { data: rawItems }] = await Promise.all([
        supabase.from('sources').select('*').eq('space_id', spaceId).order('name'),
        supabase.from('raw_items').select('source_id').eq('space_id', spaceId).not('source_id', 'is', null),
      ])

      const countMap: Record<string, number> = {}
      for (const r of (rawItems ?? [])) {
        if (r.source_id) countMap[r.source_id] = (countMap[r.source_id] ?? 0) + 1
      }

      setSources((sourcesData ?? []).map((s: Source & { notes?: string | null }) => ({
        ...s, submissionCount: countMap[s.id] ?? 0,
      })))
    } catch {
      setLoadError('Failed to load sources.')
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus(source: SourceWithCount) {
    setTogglingId(source.id)
    const newStatus = source.status === 'active' ? 'inactive' : 'active'
    await createBrowserSupabaseClient()
      .from('sources')
      .update({ status: newStatus })
      .eq('id', source.id)
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, status: newStatus } : s))
    setTogglingId(null)
  }

  async function handleDelete() {
    if (!deletingSource) return
    setDeleting(true)
    await createBrowserSupabaseClient()
      .from('sources')
      .delete()
      .eq('id', deletingSource.id)
      .eq('space_id', currentUser!.space_id!)
    setDeletingSource(null)
    setDeleting(false)
    await loadSources()
  }

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sources.length }
    for (const s of sources) counts[s.type ?? 'other'] = (counts[s.type ?? 'other'] ?? 0) + 1
    return counts
  }, [sources])

  const TAB_OPTIONS = [
    { key: 'all', label: 'All' },
    { key: 'blog', label: 'Blog' },
    { key: 'official', label: 'Official' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'ai_tool', label: 'AI Tool' },
    { key: 'other', label: 'Other' },
  ]

  const filtered = activeTab === 'all' ? sources : sources.filter(s => (s.type ?? 'other') === activeTab)

  if (sessionLoading || (loading && currentUser)) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      </div>
    )
  }

  if (!currentUser) return null

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Approved Sources</h1>
          <span className="text-sm bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">{sources.length}</span>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-teal-700 transition-colors">
          <Plus size={15} /> Add Source
        </button>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
          <AlertCircle size={16} className="text-red-500" />
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {TAB_OPTIONS.map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-slate-700'
            }`}>
            {label}
            <span className={`ml-1.5 ${activeTab === key ? 'text-gray-500' : 'text-gray-400'}`}>
              {tabCounts[key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Source list */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <Globe size={36} className="text-gray-300 mx-auto mb-4" />
          <p className="text-slate-700 font-semibold mb-1">No approved sources yet</p>
          <p className="text-sm text-gray-500 mb-5">Add sources so contributors know what to submit from.</p>
          <button onClick={() => setShowAddModal(true)}
            className="bg-teal-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-teal-700">
            Add Source
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Source</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Type</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">URL</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Credibility</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Submissions</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(source => {
                const credCfg = CREDIBILITY_CONFIG[source.credibility] ?? CREDIBILITY_CONFIG.medium
                const typeCfg = SOURCE_TYPE_CONFIG[source.type ?? 'other'] ?? SOURCE_TYPE_CONFIG.other
                const isInactive = source.status !== 'active'
                return (
                  <tr key={source.id} className={`hover:bg-gray-50 transition-colors ${isInactive ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-slate-800">{source.name}</p>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{typeCfg.label}</span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell max-w-xs">
                      <a href={source.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 truncate">
                        {source.url.replace(/^https?:\/\//, '')}
                        <ExternalLink size={10} className="flex-shrink-0" />
                      </a>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${credCfg.bg} ${credCfg.text}`}>
                        {credCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <p className="text-xs text-gray-500">{source.submissionCount} submission{source.submissionCount !== 1 ? 's' : ''}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => toggleStatus(source)}
                        disabled={togglingId === source.id}
                        className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                          source.status === 'active'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {source.status === 'active' ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setEditingSource(source)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeletingSource(source)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {(showAddModal || editingSource) && (
        <SourceModal
          source={editingSource}
          spaceId={currentUser.space_id!}
          onSave={async () => { setShowAddModal(false); setEditingSource(null); await loadSources() }}
          onClose={() => { setShowAddModal(false); setEditingSource(null) }}
        />
      )}

      {deletingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Delete Source</h2>
            <p className="text-sm text-gray-600 mb-5">
              Delete <strong>{deletingSource.name}</strong>? Existing submissions that referenced this source are not affected.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingSource(null)} disabled={deleting}
                className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
