'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, CheckCircle, ChevronDown } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { formatDate } from '@/lib/admin'

const GOLD = '#C9A84C'

const INDUSTRY_CATEGORIES = [
  'Technology', 'Finance & Fintech', 'Healthcare', 'Legal', 'Marketing & Advertising',
  'Real Estate', 'Energy & Sustainability', 'Education', 'Retail & E-Commerce',
  'Media & Entertainment', 'Manufacturing', 'Other',
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpaceRow {
  id: string
  name: string
  description: string | null
  status: 'active' | 'inactive'
  created_at: string
  adminName: string | null
  adminEmail: string | null
  userCount: number
  articleCount: number
}

// ─── Create Space Modal ───────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateSpaceModal({ onClose, onCreated }: CreateModalProps) {
  const [step, setStep]             = useState<1 | 2 | 3>(1)
  const [name, setName]             = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory]     = useState('')
  const [adminName, setAdminName]   = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleCreate() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/super-admin/create-space', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category: category || null,
          adminName: adminName.trim() || null,
          adminEmail: adminEmail.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create space')
      onCreated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create space')
      setSaving(false)
    }
  }

  const step1Valid = name.trim().length >= 2
  const step2Valid = true // admin is optional

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            {([1,2,3] as const).map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step > s ? 'bg-green-500 text-white' :
                  step === s ? 'text-white' : 'bg-gray-100 text-gray-400'
                }`} style={step === s ? { backgroundColor: GOLD } : {}}>
                  {step > s ? '✓' : s}
                </div>
                {s < 3 && <div className={`flex-1 h-0.5 w-8 ${step > s ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            {step === 1 ? 'Space Details' : step === 2 ? 'Assign Industry Admin' : 'Review & Create'}
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">Step {step} of 3</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Space Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Legal Technology"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Intelligence for professionals covering..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Industry Category
                </label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-yellow-300"
                  >
                    <option value="">Select a category…</option>
                    {INDUSTRY_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs text-amber-700">
                  The Industry Admin manages this space day-to-day. They will receive an invitation email.
                  You can skip this and assign an admin later.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Admin Full Name</label>
                <input
                  type="text"
                  value={adminName}
                  onChange={e => setAdminName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Admin Email</label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  placeholder="jane@company.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                />
              </div>
            </>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Space Details</p>
                <p className="text-sm font-semibold text-slate-900">{name}</p>
                {description && <p className="text-xs text-gray-600">{description}</p>}
                {category && <p className="text-xs text-gray-500">{category}</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Industry Admin</p>
                {adminName || adminEmail ? (
                  <>
                    {adminName && <p className="text-sm font-medium text-slate-900">{adminName}</p>}
                    {adminEmail && <p className="text-xs text-gray-500">{adminEmail} — invitation will be sent</p>}
                  </>
                ) : (
                  <p className="text-xs text-amber-600">No admin assigned — you can add one later</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          {step === 1 && (
            <>
              <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!step1Valid}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl text-white disabled:opacity-40"
                style={{ backgroundColor: GOLD }}
              >
                Next →
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl text-white"
                style={{ backgroundColor: GOLD }}
              >
                {adminEmail ? 'Next →' : 'Skip & Review'}
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <button onClick={() => setStep(2)} disabled={saving} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl text-white disabled:opacity-50"
                style={{ backgroundColor: GOLD }}
              >
                {saving ? 'Creating…' : 'Create Space'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Deactivate Modal ─────────────────────────────────────────────────────────

interface DeactivateModalProps {
  space: SpaceRow
  onClose: () => void
  onDeactivated: () => void
}

function DeactivateModal({ space, onClose, onDeactivated }: DeactivateModalProps) {
  const [confirmText, setConfirmText] = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const confirmed = confirmText === space.name

  async function handleDeactivate() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/super-admin/deactivate-space', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId: space.id, activate: false }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to deactivate space')
      onDeactivated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-red-100 bg-red-50 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-red-900">Deactivate Industry Space</h2>
          <p className="text-sm text-red-700 mt-1">This is a significant action affecting real users.</p>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5 text-sm text-amber-900">
            <p className="font-semibold">Deactivating <span className="italic">{space.name}</span> will:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Immediately block all <strong>{space.userCount}</strong> user{space.userCount !== 1 ? 's' : ''} from accessing the space</li>
              <li>Invalidate all active sessions in this space</li>
              <li>Preserve all content and settings — nothing is deleted</li>
              <li>Can be reversed at any time by reactivating</li>
            </ul>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Type the space name to confirm: <span className="text-red-500 normal-case font-mono">{space.name}</span>
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="Type exact space name…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleDeactivate}
            disabled={!confirmed || saving}
            className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-40"
          >
            {saving ? 'Deactivating…' : 'Confirm Deactivation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'active' | 'inactive'

export default function SpacesPage() {
  const { loading: sessionLoading } = useSession()
  const [spaces, setSpaces]         = useState<SpaceRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<FilterTab>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<SpaceRow | null>(null)
  const [toastMsg, setToastMsg]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createBrowserSupabaseClient()
    const [spacesRes, usersRes, articlesRes] = await Promise.all([
      supabase.from('industry_spaces').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('id, name, email, role, space_id'),
      supabase.from('final_items').select('id, space_id'),
    ])

    const rawSpaces   = (spacesRes.data   ?? []) as Array<{ id: string; name: string; description: string | null; status: string; created_at: string }>
    const rawUsers    = (usersRes.data    ?? []) as Array<{ id: string; name: string; email: string; role: string; space_id: string | null }>
    const rawArticles = (articlesRes.data ?? []) as Array<{ id: string; space_id: string }>

    setSpaces(rawSpaces.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status as 'active' | 'inactive',
      created_at: s.created_at,
      adminName: rawUsers.find(u => u.role === 'industry_admin' && u.space_id === s.id)?.name ?? null,
      adminEmail: rawUsers.find(u => u.role === 'industry_admin' && u.space_id === s.id)?.email ?? null,
      userCount: rawUsers.filter(u => u.space_id === s.id).length,
      articleCount: rawArticles.filter(a => a.space_id === s.id).length,
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!sessionLoading) load()
  }, [sessionLoading, load])

  async function handleToggleActivate(space: SpaceRow) {
    if (space.status === 'active') {
      setDeactivateTarget(space)
      return
    }
    // Reactivate immediately (no confirmation needed)
    const res = await fetch('/api/super-admin/deactivate-space', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId: space.id, activate: true }),
    })
    if (res.ok) {
      showToast(`${space.name} reactivated`)
      load()
    }
  }

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  const filtered = tab === 'all' ? spaces : spaces.filter(s => s.status === tab)

  return (
    <div className="max-w-screen-xl mx-auto p-8 space-y-6">

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          <CheckCircle size={14} className="text-green-400" />
          {toastMsg}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateSpaceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); showToast('Space created successfully'); load() }}
        />
      )}
      {deactivateTarget && (
        <DeactivateModal
          space={deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
          onDeactivated={() => { setDeactivateTarget(null); showToast(`${deactivateTarget.name} deactivated`); load() }}
        />
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Industry Spaces</h1>
          <p className="text-sm text-gray-400 mt-0.5">{spaces.length} space{spaces.length !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: GOLD }}
        >
          + Create New Industry Space
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {([
          { key: 'all',      label: `All (${spaces.length})`                                 },
          { key: 'active',   label: `Active (${spaces.filter(s => s.status === 'active').length})`   },
          { key: 'inactive', label: `Inactive (${spaces.filter(s => s.status === 'inactive').length})` },
        ] as { key: FilterTab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={tab === t.key
              ? { borderColor: GOLD, color: GOLD }
              : { borderColor: 'transparent', color: '#6B7280' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[0,1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg font-semibold text-slate-800 mb-2">No spaces found</p>
          <p className="text-sm text-gray-400 mb-6">
            {tab === 'all' ? 'Create your first Industry Space to get started.' : `No ${tab} spaces.`}
          </p>
          {tab === 'all' && (
            <button onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: GOLD }}>
              Create First Space
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Space</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Industry Admin</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Users</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Articles</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(space => (
                <tr key={space.id} className={`hover:bg-gray-50 transition-colors ${space.status === 'inactive' ? 'opacity-60' : ''}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: space.status === 'active' ? GOLD : '#9CA3AF' }} />
                      <div>
                        <p className="font-semibold text-slate-900">{space.name}</p>
                        {space.description && (
                          <p className="text-xs text-gray-400 truncate max-w-xs">{space.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {space.adminName ? (
                      <div>
                        <p className="font-medium text-slate-700">{space.adminName}</p>
                        <p className="text-xs text-gray-400">{space.adminEmail}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-600 font-medium">Not assigned</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="font-semibold text-slate-700">{space.userCount}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="font-semibold text-slate-700">{space.articleCount}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button
                      onClick={() => handleToggleActivate(space)}
                      className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                        space.status === 'active'
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {space.status === 'active' ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-500">{formatDate(space.created_at)}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => handleToggleActivate(space)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        space.status === 'active'
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : 'border-green-200 text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {space.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
