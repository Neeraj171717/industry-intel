'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, MoreVertical, AlertCircle, CheckCircle } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { ROLE_CONFIG, USER_STATUS_CONFIG, formatDate } from '@/lib/admin'

const GOLD = '#C9A84C'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlobalUser {
  id: string
  name: string
  email: string
  role: string
  status: string
  space_id: string | null
  spaceName: string | null
  created_at: string
}

interface SpaceOption {
  id: string
  name: string
}

type FilterTab = 'all' | 'industry_admin' | 'editor' | 'contributor' | 'user' | 'suspended'

// ─── Space Pill ───────────────────────────────────────────────────────────────

const SPACE_PILL_COLORS = [
  'bg-teal-100 text-teal-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
]

function spacePillColor(spaceName: string): string {
  let hash = 0
  for (let i = 0; i < spaceName.length; i++) hash += spaceName.charCodeAt(i)
  return SPACE_PILL_COLORS[hash % SPACE_PILL_COLORS.length]
}

// ─── Create Admin Modal ───────────────────────────────────────────────────────

function CreateAdminModal({
  spaces,
  onClose,
  onCreated,
}: {
  spaces: SpaceOption[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const valid = name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !!spaceId

  async function handleCreate() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/super-admin/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), spaceId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create admin')
      onCreated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create admin')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-slate-900">Create Industry Admin</h2>
          <p className="text-sm text-gray-400 mt-0.5">They will receive an invitation email to set up their account.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Assign to Space <span className="text-red-500">*</span>
            </label>
            <select value={spaceId} onChange={e => setSpaceId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
              <option value="">Select a space…</option>
              {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!valid || saving}
            className="flex-1 text-sm font-semibold py-2.5 rounded-xl text-white disabled:opacity-40"
            style={{ backgroundColor: GOLD }}>
            {saving ? 'Creating…' : 'Create & Send Invitation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Suspend Modal ────────────────────────────────────────────────────────────

function SuspendModal({
  user,
  onClose,
  onSuspended,
}: {
  user: GlobalUser
  onClose: () => void
  onSuspended: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const isAdmin = user.role === 'industry_admin'

  async function handleSuspend() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/super-admin/suspend-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to suspend user')
      onSuspended()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to suspend user')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className={`px-6 pt-6 pb-4 border-b rounded-t-2xl ${isAdmin ? 'bg-red-50 border-red-100' : 'border-gray-100'}`}>
          <h2 className={`text-lg font-semibold ${isAdmin ? 'text-red-900' : 'text-slate-900'}`}>
            Suspend Account
          </h2>
          <p className={`text-sm mt-0.5 ${isAdmin ? 'text-red-700' : 'text-gray-400'}`}>
            {isAdmin ? 'Industry Admin suspension — elevated impact' : `Suspend ${user.name}`}
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {isAdmin && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-1">
              <p className="font-semibold">⚠️ Suspending an Industry Admin</p>
              <p className="text-xs">
                <strong>{user.name}</strong> manages the <strong>{user.spaceName ?? 'assigned'}</strong> space.
                Suspending their account will remove their access immediately.
                The space will continue to function — editors and contributors are not affected.
                Assign a replacement Industry Admin promptly.
              </p>
            </div>
          )}
          <p className="text-sm text-slate-700">
            Are you sure you want to suspend <strong>{user.name}</strong> ({user.email})?
            Their active sessions will be invalidated immediately.
          </p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSuspend} disabled={saving}
            className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Suspending…' : 'Suspend Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GlobalUsersPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [users, setUsers]     = useState<GlobalUser[]>([])
  const [spaces, setSpaces]   = useState<SpaceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<FilterTab>('all')
  const [spaceFilter, setSpaceFilter] = useState('all')
  const [search, setSearch]   = useState('')
  const [showCreate, setShowCreate]   = useState(false)
  const [suspendTarget, setSuspendTarget] = useState<GlobalUser | null>(null)
  const [openMenuId, setOpenMenuId]   = useState<string | null>(null)
  const [toastMsg, setToastMsg]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createBrowserSupabaseClient()
    const [usersRes, spacesRes] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase.from('industry_spaces').select('id, name').order('name'),
    ])

    const rawUsers  = (usersRes.data  ?? []) as Array<{ id: string; name: string; email: string; role: string; status: string; space_id: string | null; created_at: string }>
    const rawSpaces = (spacesRes.data ?? []) as SpaceOption[]
    const spaceMap  = Object.fromEntries(rawSpaces.map(s => [s.id, s.name]))

    setSpaces(rawSpaces)
    setUsers(rawUsers.map(u => ({
      ...u,
      spaceName: u.space_id ? (spaceMap[u.space_id] ?? null) : null,
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!sessionLoading) load()
  }, [sessionLoading, load])

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  // Filtering
  const filtered = users.filter(u => {
    if (tab === 'suspended' && u.status !== 'suspended') return false
    if (tab !== 'all' && tab !== 'suspended' && u.role !== tab) return false
    if (spaceFilter !== 'all' && u.space_id !== spaceFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
    }
    return true
  })

  function tabCount(t: FilterTab): number {
    if (t === 'all')       return users.length
    if (t === 'suspended') return users.filter(u => u.status === 'suspended').length
    return users.filter(u => u.role === t).length
  }

  const TAB_LABELS: { key: FilterTab; label: string }[] = [
    { key: 'all',             label: `All (${tabCount('all')})`                           },
    { key: 'industry_admin',  label: `Industry Admins (${tabCount('industry_admin')})`    },
    { key: 'editor',          label: `Editors (${tabCount('editor')})`                    },
    { key: 'contributor',     label: `Contributors (${tabCount('contributor')})`          },
    { key: 'user',            label: `End Users (${tabCount('user')})`                    },
    { key: 'suspended',       label: `Suspended (${tabCount('suspended')})`               },
  ]

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
        <CreateAdminModal
          spaces={spaces}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); showToast('Industry Admin created — invitation sent'); load() }}
        />
      )}
      {suspendTarget && (
        <SuspendModal
          user={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onSuspended={() => { setSuspendTarget(null); showToast(`${suspendTarget.name} suspended`); load() }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global Users</h1>
          <p className="text-sm text-gray-400 mt-0.5">{users.length.toLocaleString()} users across all spaces</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: GOLD }}
        >
          + Create Industry Admin
        </button>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3">
        {/* Space filter */}
        <select value={spaceFilter} onChange={e => setSpaceFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-white min-w-44">
          <option value="all">All Spaces</option>
          {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
          />
        </div>
      </div>

      {/* Role filter tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {TAB_LABELS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap"
            style={tab === t.key
              ? { borderColor: GOLD, color: GOLD }
              : { borderColor: 'transparent', color: '#6B7280' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* User table */}
      {loading ? (
        <div className="space-y-3">
          {[0,1,2,3,4].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg font-semibold text-slate-800 mb-2">No users found</p>
          <p className="text-sm text-gray-400">
            {tab === 'industry_admin' ? 'No Industry Admins assigned yet. Create your first admin to get started.' : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Space</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => {
                const roleCfg   = ROLE_CONFIG[u.role]   ?? ROLE_CONFIG['user']
                const statusCfg = USER_STATUS_CONFIG[u.status] ?? { label: u.status, bg: 'bg-gray-100', text: 'text-gray-600' }
                const initials  = u.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()

                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    {/* User */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${roleCfg.avatarBg} ${roleCfg.avatarText}`}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleCfg.bg} ${roleCfg.text}`}>
                        {roleCfg.label}
                      </span>
                    </td>

                    {/* Space */}
                    <td className="px-4 py-3.5">
                      {u.spaceName ? (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${spacePillColor(u.spaceName)}`}>
                          {u.spaceName}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 text-center">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                        {statusCfg.label}
                      </span>
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-3.5 text-xs text-gray-500">{formatDate(u.created_at)}</td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right relative">
                      {/* Cannot suspend super_admin or self */}
                      {u.role !== 'super_admin' && u.id !== currentUser?.id && (
                        <div className="relative inline-block">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenuId === u.id && (
                            <div className="absolute right-0 top-8 w-44 bg-white rounded-xl border border-gray-200 shadow-lg z-10 py-1">
                              {u.status !== 'suspended' ? (
                                <button
                                  onClick={() => { setOpenMenuId(null); setSuspendTarget(u) }}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  Suspend Account
                                </button>
                              ) : (
                                <button
                                  onClick={async () => {
                                    setOpenMenuId(null)
                                    await createBrowserSupabaseClient().from('users').update({ status: 'active' }).eq('id', u.id)
                                    showToast(`${u.name} reactivated`)
                                    load()
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors"
                                >
                                  Reinstate Account
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Close menu on outside click */}
      {openMenuId && (
        <div className="fixed inset-0 z-5" onClick={() => setOpenMenuId(null)} />
      )}
    </div>
  )
}
