'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, AlertCircle, Tag as TagIcon } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { timeAgo, TAG_TYPE_CONFIG } from '@/lib/admin'
import type { Tag } from '@/types'

type TagType = 'topic' | 'content_type' | 'severity' | 'locality' | 'impact'
const TAG_TYPES: TagType[] = ['topic', 'content_type', 'severity', 'locality', 'impact']
const TAB_LABELS: Record<string, string> = {
  all: 'All', topic: 'Topic', content_type: 'Content Type',
  severity: 'Severity', locality: 'Locality', impact: 'Impact',
}

interface TagWithCount extends Tag { articleCount: number }

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function TagModal({
  tag, spaceId, onSave, onClose,
}: {
  tag: TagWithCount | null
  spaceId: string
  onSave: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(tag?.name ?? '')
  const [type, setType] = useState<TagType>(tag?.type as TagType ?? 'topic')
  const [description, setDescription] = useState(tag?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim()) { setError('Tag name is required'); return }
    setSaving(true)
    setError(null)
    const supabase = createBrowserSupabaseClient()
    try {
      if (tag) {
        // Edit — type locked
        const { error: e } = await supabase
          .from('tags')
          .update({ name: name.trim(), description: description.trim() || null, updated_at: new Date().toISOString() })
          .eq('id', tag.id)
        if (e) throw e
      } else {
        // Check uniqueness
        const { data: existing } = await supabase
          .from('tags')
          .select('id')
          .eq('space_id', spaceId)
          .eq('type', type)
          .ilike('name', name.trim())
          .maybeSingle()
        if (existing) { setError(`A ${TAB_LABELS[type]} tag named "${name.trim()}" already exists.`); setSaving(false); return }

        const { error: e } = await supabase.from('tags').insert({
          space_id: spaceId, name: name.trim(), type,
          description: description.trim() || null, status: 'active',
        })
        if (e) throw e
      }
      onSave()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save tag')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">{tag ? 'Edit Tag' : 'Add Tag'}</h2>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Tag Name <span className="text-red-500">*</span></label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. AI Tools"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Tag Type <span className="text-red-500">*</span></label>
            <select
              value={type} onChange={e => setType(e.target.value as TagType)}
              disabled={!!tag}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:bg-gray-50 disabled:text-gray-400"
            >
              {TAG_TYPES.map(t => <option key={t} value={t}>{TAB_LABELS[t]}</option>)}
            </select>
            {tag && <p className="text-xs text-gray-400 mt-1">Tag type cannot be changed after creation.</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Description <span className="font-normal text-gray-400 normal-case">(optional)</span></label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="Brief description of this tag…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving} className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()} className="flex-1 bg-teal-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving…' : (tag ? 'Save Changes' : 'Create Tag')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
function DeleteTagModal({
  tag, onConfirm, onClose, deleting,
}: {
  tag: TagWithCount
  onConfirm: () => void
  onClose: () => void
  deleting: boolean
}) {
  const [confirmText, setConfirmText] = useState('')
  const needsConfirm = tag.articleCount > 0
  const canDelete = !needsConfirm || confirmText === 'DELETE'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Delete Tag</h2>
        {needsConfirm ? (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800 font-medium mb-1">This tag is used in {tag.articleCount} article{tag.articleCount !== 1 ? 's' : ''}.</p>
              <p className="text-xs text-amber-700">Deleting it will remove it from all those articles. This cannot be undone.</p>
            </div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Type DELETE to confirm</label>
            <input
              type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
            />
          </>
        ) : (
          <p className="text-sm text-gray-600 mb-5">Delete <strong>{tag.name}</strong>? It has not been used in any articles.</p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={deleting} className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={!canDelete || deleting} className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50">
            {deleting ? 'Deleting…' : 'Delete Tag'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TagsPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingTag, setEditingTag] = useState<TagWithCount | null>(null)
  const [deletingTag, setDeletingTag] = useState<TagWithCount | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (sessionLoading || !currentUser) return
    loadTags()
  }, [sessionLoading, currentUser])

  async function loadTags() {
    try {
      setLoading(true)
      setLoadError(null)
      const supabase = createBrowserSupabaseClient()
      const spaceId = currentUser!.space_id!

      const [{ data: tagsData }, { data: articleTagsData }] = await Promise.all([
        supabase.from('tags').select('*').eq('space_id', spaceId).order('name'),
        supabase.from('article_tags').select('tag_id'),
      ])

      const countMap: Record<string, number> = {}
      for (const row of (articleTagsData ?? [])) {
        countMap[row.tag_id] = (countMap[row.tag_id] ?? 0) + 1
      }

      setTags((tagsData ?? []).map((t: Tag) => ({ ...t, articleCount: countMap[t.id] ?? 0 })))
    } catch {
      setLoadError('Failed to load tags.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deletingTag) return
    setDeleting(true)
    const supabase = createBrowserSupabaseClient()
    const spaceId = currentUser!.space_id!
    try {
      // Cascade: article_tags, user_tag_weights
      await Promise.all([
        supabase.from('article_tags').delete().eq('tag_id', deletingTag.id),
        supabase.from('user_tag_weights').delete().eq('tag_id', deletingTag.id),
      ])

      // user_preferences: remove tag from followed_tag_ids arrays
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('id, followed_tag_ids')
        .eq('space_id', spaceId)

      if (prefs && prefs.length > 0) {
        await Promise.all(
          prefs
            .filter((p: { id: string; followed_tag_ids: string[] }) =>
              p.followed_tag_ids?.includes(deletingTag.id)
            )
            .map((p: { id: string; followed_tag_ids: string[] }) =>
              supabase
                .from('user_preferences')
                .update({ followed_tag_ids: p.followed_tag_ids.filter((id: string) => id !== deletingTag.id) })
                .eq('id', p.id)
            )
        )
      }

      await supabase.from('tags').delete().eq('id', deletingTag.id).eq('space_id', spaceId)
      setDeletingTag(null)
      await loadTags()
    } catch {
      // keep modal open on error
    } finally {
      setDeleting(false)
    }
  }

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tags.length }
    for (const t of tags) counts[t.type] = (counts[t.type] ?? 0) + 1
    return counts
  }, [tags])

  const filtered = activeTab === 'all' ? tags : tags.filter(t => t.type === activeTab)

  if (sessionLoading || (loading && currentUser)) {
    return (
      <div className="p-8">
        <div className="h-8 w-40 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      </div>
    )
  }

  if (!currentUser) return null

  const spaceId = currentUser.space_id!

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Tags</h1>
          <span className="text-sm bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">{tags.length}</span>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-teal-700 transition-colors"
        >
          <Plus size={15} /> Add Tag
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
        {['all', ...TAG_TYPES].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-gray-500 hover:text-slate-700'
            }`}
          >
            {TAB_LABELS[tab]}
            <span className={`ml-1.5 text-xs ${activeTab === tab ? 'text-gray-500' : 'text-gray-400'}`}>
              {tabCounts[tab] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Tag list */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <TagIcon size={36} className="text-gray-300 mx-auto mb-4" />
          <p className="text-slate-700 font-semibold mb-1">No tags created yet</p>
          <p className="text-sm text-gray-500 mb-5">Tags are essential for personalisation. Create your first tag.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-teal-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-teal-700"
          >
            Add Tag
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Tag Name</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Description</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Usage</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(tag => {
                const typeCfg = TAG_TYPE_CONFIG[tag.type] ?? { label: tag.type, bg: 'bg-gray-100', text: 'text-gray-600' }
                return (
                  <tr key={tag.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-slate-800">{tag.name}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeCfg.bg} ${typeCfg.text}`}>
                        {typeCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell max-w-xs">
                      <p className="text-xs text-gray-500 truncate">{tag.description ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs text-gray-500">
                        {tag.articleCount > 0 ? `Used in ${tag.articleCount} article${tag.articleCount !== 1 ? 's' : ''}` : 'Not used yet'}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <p className="text-xs text-gray-400">{timeAgo(tag.created_at)}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setEditingTag(tag)} className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeletingTag(tag)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
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
      {(showAddModal || editingTag) && (
        <TagModal
          tag={editingTag}
          spaceId={spaceId}
          onSave={async () => { setShowAddModal(false); setEditingTag(null); await loadTags() }}
          onClose={() => { setShowAddModal(false); setEditingTag(null) }}
        />
      )}
      {deletingTag && (
        <DeleteTagModal
          tag={deletingTag}
          onConfirm={handleDelete}
          onClose={() => setDeletingTag(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}
