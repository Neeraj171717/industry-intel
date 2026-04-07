'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, MoreHorizontal, Search, AlertCircle, Users as UsersIcon } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { timeAgo, ROLE_CONFIG, USER_STATUS_CONFIG } from '@/lib/admin'
import type { User } from '@/types'

type FilterTab = 'all' | 'editor' | 'contributor' | 'user' | 'pending' | 'suspended'
type SortKey = 'newest' | 'alphabetical' | 'role'

// ─── Invite Modal ─────────────────────────────────────────────────────────────
function InviteModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'contributor'>('editor')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) { setError('Name and email are required'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send invitation')
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send invitation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Invite Team Member</h2>
        <p className="text-sm text-gray-500 mb-4">An invitation email will be sent with a link to set their password.</p>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Full Name <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Email Address <span className="text-red-500">*</span></label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Role <span className="text-red-500">*</span></label>
            <select value={role} onChange={e => setRole(e.target.value as 'editor' | 'contributor')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300">
              <option value="editor">Editor</option>
              <option value="contributor">Contributor</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving} className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim() || !email.trim()}
            className="flex-1 bg-teal-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Sending…' : 'Send Invitation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Approve Modal ────────────────────────────────────────────────────────────
function ApproveModal({ user, onConfirm, onClose, saving }: { user: User; onConfirm: () => void; onClose: () => void; saving: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Approve User</h2>
        <p className="text-sm text-gray-600 mb-1"><strong>{user.name}</strong> will be granted access to the feed as an End User.</p>
        <p className="text-xs text-gray-400 mb-5">{user.email}</p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={saving} className="flex-1 bg-teal-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Approving…' : 'Confirm Approval'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
function RejectModal({ user, onConfirm, onClose, saving }: { user: User; onConfirm: (reason: string) => void; onClose: () => void; saving: boolean }) {
  const [reason, setReason] = useState('Not relevant to our industry')
  const REASONS = ['Not relevant to our industry', 'Duplicate account', 'Suspicious account', 'Other']
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Reject User</h2>
        <p className="text-sm text-gray-600 mb-4">Reject <strong>{user.name}</strong>? Their account will be suspended.</p>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Reason</label>
        <select value={reason} onChange={e => setReason(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white mb-5 focus:outline-none focus:ring-2 focus:ring-red-300">
          {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={() => onConfirm(reason)} disabled={saving} className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Rejecting…' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Suspend Modal ────────────────────────────────────────────────────────────
function SuspendModal({ user, onConfirm, onClose, saving }: { user: User; onConfirm: () => void; onClose: () => void; saving: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Suspend Account</h2>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-amber-800 font-medium">Are you sure you want to suspend {user.name}?</p>
          <p className="text-xs text-amber-700 mt-1">They will lose access immediately. You can reactivate at any time.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={saving} className="flex-1 bg-amber-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-amber-700 disabled:opacity-50">
            {saving ? 'Suspending…' : 'Suspend Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Change Role Modal ────────────────────────────────────────────────────────
function ChangeRoleModal({ user, onConfirm, onClose, saving }: { user: User; onConfirm: (role: string) => void; onClose: () => void; saving: boolean }) {
  const [newRole, setNewRole] = useState(user.role === 'editor' ? 'contributor' : 'editor')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Change Role</h2>
        <p className="text-sm text-gray-600 mb-4">Current role: <strong>{ROLE_CONFIG[user.role]?.label ?? user.role}</strong></p>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">New Role</label>
        <select value={newRole} onChange={e => setNewRole(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white mb-3 focus:outline-none focus:ring-2 focus:ring-teal-300">
          <option value="editor">Editor</option>
          <option value="contributor">Contributor</option>
        </select>
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-5">
          <p className="text-xs text-blue-700">Changing this user&apos;s role will change what they can access immediately.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={() => onConfirm(newRole)} disabled={saving || newRole === user.role}
            className="flex-1 bg-teal-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Updating…' : 'Change Role'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Three-dot Actions Menu ───────────────────────────────────────────────────
function ActionsMenu({
  user,
  onApprove, onReject, onSuspend, onReactivate, onChangeRole, onRemove,
}: {
  user: User
  onApprove: () => void; onReject: () => void; onSuspend: () => void
  onReactivate: () => void; onChangeRole: () => void; onRemove: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44 min-w-max">
            {user.status === 'pending' && (
              <>
                <button onClick={() => { setOpen(false); onApprove() }} className="w-full text-left px-4 py-2 text-sm text-teal-700 hover:bg-teal-50">Approve</button>
                <button onClick={() => { setOpen(false); onReject() }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Reject</button>
              </>
            )}
            {user.status === 'active' && (
              <>
                {['editor', 'contributor'].includes(user.role) && (
                  <button onClick={() => { setOpen(false); onChangeRole() }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-gray-50">Change Role</button>
                )}
                <button onClick={() => { setOpen(false); onSuspend() }} className="w-full text-left px-4 py-2 text-sm text-amber-700 hover:bg-amber-50">Suspend Account</button>
                <button onClick={() => { setOpen(false); onRemove() }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Remove from Space</button>
              </>
            )}
            {user.status === 'suspended' && (
              <button onClick={() => { setOpen(false); onReactivate() }} className="w-full text-left px-4 py-2 text-sm text-teal-700 hover:bg-teal-50">Reactivate Account</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [actionSaving, setActionSaving] = useState(false)

  // Modal state
  const [showInvite, setShowInvite] = useState(false)
  const [approvingUser, setApprovingUser] = useState<User | null>(null)
  const [rejectingUser, setRejectingUser] = useState<User | null>(null)
  const [suspendingUser, setSuspendingUser] = useState<User | null>(null)
  const [changingRoleUser, setChangingRoleUser] = useState<User | null>(null)

  useEffect(() => {
    if (sessionLoading || !currentUser) return
    loadUsers()
  }, [sessionLoading, currentUser])

  async function loadUsers() {
    try {
      setLoading(true); setLoadError(null)
      const { data, error } = await createBrowserSupabaseClient()
        .from('users')
        .select('*')
        .eq('space_id', currentUser!.space_id!)
        .order('created_at', { ascending: false })
      if (error) throw error
      setUsers(data ?? [])
    } catch {
      setLoadError('Failed to load users.')
    } finally {
      setLoading(false)
    }
  }

  async function approveUser(u: User) {
    setActionSaving(true)
    await createBrowserSupabaseClient()
      .from('users')
      .update({ status: 'active', role: 'user', updated_at: new Date().toISOString() })
      .eq('id', u.id)
    setApprovingUser(null); setActionSaving(false)
    await loadUsers()
  }

  async function rejectUser(u: User) {
    setActionSaving(true)
    await createBrowserSupabaseClient()
      .from('users')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', u.id)
    setRejectingUser(null); setActionSaving(false)
    await loadUsers()
  }

  async function suspendUser(u: User) {
    setActionSaving(true)
    const res = await fetch('/api/admin/suspend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: u.id }),
    })
    if (res.ok) { setSuspendingUser(null); await loadUsers() }
    setActionSaving(false)
  }

  async function reactivateUser(u: User) {
    await createBrowserSupabaseClient()
      .from('users')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', u.id)
    await loadUsers()
  }

  async function changeRole(u: User, newRole: string) {
    setActionSaving(true)
    await createBrowserSupabaseClient()
      .from('users')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', u.id)
    setChangingRoleUser(null); setActionSaving(false)
    await loadUsers()
  }

  async function removeUser(u: User) {
    if (!confirm(`Remove ${u.name} from this space? They will lose all access.`)) return
    await createBrowserSupabaseClient()
      .from('users')
      .update({ space_id: null, status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', u.id)
    await loadUsers()
  }

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0, editor: 0, contributor: 0, user: 0, pending: 0, suspended: 0 }
    for (const u of users) {
      c.all++
      if (u.status === 'pending') c.pending++
      else if (u.status === 'suspended') c.suspended++
      else if (u.role === 'editor') c.editor++
      else if (u.role === 'contributor') c.contributor++
      else if (u.role === 'user') c.user++
    }
    return c
  }, [users])

  const filtered = useMemo(() => {
    let result = users.filter(u => {
      if (activeTab === 'pending') return u.status === 'pending'
      if (activeTab === 'suspended') return u.status === 'suspended'
      if (activeTab === 'editor') return u.role === 'editor' && u.status === 'active'
      if (activeTab === 'contributor') return u.role === 'contributor' && u.status === 'active'
      if (activeTab === 'user') return u.role === 'user' && u.status === 'active'
      return true
    })
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    }
    if (sort === 'alphabetical') result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'role') result = [...result].sort((a, b) => a.role.localeCompare(b.role))
    return result
  }, [users, activeTab, search, sort])

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'editor', label: 'Editors' },
    { key: 'contributor', label: 'Contributors' },
    { key: 'user', label: 'End Users' },
    { key: 'pending', label: 'Pending' },
    { key: 'suspended', label: 'Suspended' },
  ]

  if (sessionLoading || (loading && currentUser)) {
    return (
      <div className="p-8">
        <div className="h-8 w-40 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      </div>
    )
  }

  if (!currentUser) return null

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <span className="text-sm bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">{users.length}</span>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-teal-700 transition-colors">
          <Plus size={15} /> Invite Team Member
        </button>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
          <AlertCircle size={16} className="text-red-500" />
          <p className="text-sm text-red-700">{loadError}</p>
          <button onClick={loadUsers} className="ml-auto text-xs text-red-600 underline">Retry</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(({ key, label }) => (
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

      {/* Search + sort */}
      <div className="flex gap-3 mb-5">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300">
          <option value="newest">Newest Joined</option>
          <option value="alphabetical">Alphabetical</option>
          <option value="role">By Role</option>
        </select>
      </div>

      {/* User list */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <UsersIcon size={36} className="text-gray-300 mx-auto mb-4" />
          <p className="text-slate-700 font-semibold">No users found</p>
          <p className="text-sm text-gray-500 mt-1">
            {search ? 'Try a different search term' : activeTab === 'all' ? 'Invite your first team member to get started' : `No ${activeTab} users in your space yet`}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">
          {filtered.map(u => {
            const roleCfg = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.user
            const statusCfg = USER_STATUS_CONFIG[u.status] ?? USER_STATUS_CONFIG.active
            const initials = u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            return (
              <div key={u.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${roleCfg.avatarBg}`}>
                  <span className={`text-xs font-bold ${roleCfg.avatarText}`}>{initials}</span>
                </div>
                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{u.name}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
                {/* Role badge */}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:inline-flex ${roleCfg.bg} ${roleCfg.text}`}>
                  {roleCfg.label}
                </span>
                {/* Status badge */}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusCfg.bg} ${statusCfg.text}`}>
                  {statusCfg.label}
                </span>
                {/* Joined */}
                <p className="text-xs text-gray-400 hidden md:block flex-shrink-0 w-20 text-right">{timeAgo(u.created_at)}</p>
                {/* Actions */}
                <ActionsMenu
                  user={u}
                  onApprove={() => setApprovingUser(u)}
                  onReject={() => setRejectingUser(u)}
                  onSuspend={() => setSuspendingUser(u)}
                  onReactivate={() => reactivateUser(u)}
                  onChangeRole={() => setChangingRoleUser(u)}
                  onRemove={() => removeUser(u)}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showInvite && (
        <InviteModal
          onSuccess={async () => { setShowInvite(false); await loadUsers() }}
          onClose={() => setShowInvite(false)}
        />
      )}
      {approvingUser && (
        <ApproveModal user={approvingUser} saving={actionSaving}
          onConfirm={() => approveUser(approvingUser)}
          onClose={() => setApprovingUser(null)} />
      )}
      {rejectingUser && (
        <RejectModal user={rejectingUser} saving={actionSaving}
          onConfirm={() => rejectUser(rejectingUser)}
          onClose={() => setRejectingUser(null)} />
      )}
      {suspendingUser && (
        <SuspendModal user={suspendingUser} saving={actionSaving}
          onConfirm={() => suspendUser(suspendingUser)}
          onClose={() => setSuspendingUser(null)} />
      )}
      {changingRoleUser && (
        <ChangeRoleModal user={changingRoleUser} saving={actionSaving}
          onConfirm={(role) => changeRole(changingRoleUser, role)}
          onClose={() => setChangingRoleUser(null)} />
      )}
    </div>
  )
}
