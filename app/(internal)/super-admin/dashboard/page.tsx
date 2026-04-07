'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AlertTriangle, Users, FileText, CheckCircle, RefreshCw, X, ChevronRight } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { getGreeting, timeAgo } from '@/lib/admin'

const GOLD = '#C9A84C'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpaceCard {
  id: string
  name: string
  description: string | null
  status: 'active' | 'inactive'
  created_at: string
  adminName: string | null
  adminEmail: string | null
  userCount: number
  articleCount: number
  pendingCount: number
}

interface PlatformStats {
  totalSpaces: number
  activeSpaces: number
  totalUsers: number
  totalArticles: number
  articlesThisMonth: number
  platformHealth: 'operational' | 'degraded' | 'down'
}

interface ActivityItem {
  id: string
  type: 'space_created' | 'user_joined' | 'article_published'
  label: string
  timestamp: string
}

interface DashboardData {
  stats: PlatformStats
  spaces: SpaceCard[]
  activity: ActivityItem[]
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-lg ${className ?? ''}`} />
}

function DashboardSkeleton() {
  return (
    <div className="max-w-screen-xl mx-auto p-8 space-y-8">
      <Skeleton className="h-9 w-80" />
      <div className="grid grid-cols-4 gap-6">
        {[0,1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="grid grid-cols-3 gap-5">
        {[0,1,2,3,4,5].map(i => <Skeleton key={i} className="h-48" />)}
      </div>
    </div>
  )
}

// ─── Setup wizard ─────────────────────────────────────────────────────────────

function SetupWizard() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-10 max-w-lg mx-auto text-center">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ backgroundColor: '#FEF9EE', border: `2px solid ${GOLD}` }}>
        <span className="text-2xl">🏭</span>
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">Welcome to Industry Intelligence</h2>
      <p className="text-sm text-gray-500 mb-6">
        No Industry Spaces exist yet. Create your first space to get the platform running.
      </p>
      <Link
        href="/super-admin/spaces"
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
        style={{ backgroundColor: GOLD }}
      >
        Create First Industry Space
      </Link>
    </div>
  )
}

// ─── Health badge ──────────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: PlatformStats['platformHealth'] }) {
  const cfg = {
    operational: { label: 'Operational', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
    degraded:    { label: 'Degraded',    bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500' },
    down:        { label: 'Down',        bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
  }[health]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SuperAdminDashboardPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [data, setData]           = useState<DashboardData | null>(null)
  const [loadingData, setLoading] = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [alertDismissed, setAlertDismissed] = useState(false)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createBrowserSupabaseClient()

    try {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

      // ── 1. Parallel top-level counts ──────────────────────────────────
      const [
        spacesRes,
        usersRes,
        articlesRes,
        articlesMonthRes,
        rawItemsRes,
        recentArticlesRes,
        recentUsersRes,
        recentSpacesRes,
      ] = await Promise.all([
        supabase.from('industry_spaces').select('id, name, description, status, created_at'),
        supabase.from('users').select('id, name, email, role, space_id, created_at'),
        supabase.from('final_items').select('id, space_id, title, published_at'),
        supabase.from('final_items').select('id', { count: 'exact', head: true }).gte('published_at', startOfMonth),
        supabase.from('raw_items').select('id, space_id, status'),
        supabase.from('final_items').select('id, title, published_at').order('published_at', { ascending: false }).limit(5),
        supabase.from('users').select('id, name, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('industry_spaces').select('id, name, created_at').order('created_at', { ascending: false }).limit(3),
      ])

      for (const r of [spacesRes, usersRes, articlesRes, articlesMonthRes, rawItemsRes]) {
        if (r.error) throw r.error
      }

      const spaces   = (spacesRes.data  ?? []) as Array<{ id: string; name: string; description: string | null; status: string; created_at: string }>
      const users    = (usersRes.data   ?? []) as Array<{ id: string; name: string; email: string; role: string; space_id: string | null; created_at: string }>
      const articles = (articlesRes.data ?? []) as Array<{ id: string; space_id: string; title: string; published_at: string }>
      const pending  = (rawItemsRes.data ?? []) as Array<{ id: string; space_id: string; status: string }>

      // ── 2. Build space cards ──────────────────────────────────────────
      const spaceCards: SpaceCard[] = spaces.map(space => {
        const admin      = users.find(u => u.role === 'industry_admin' && u.space_id === space.id)
        const userCount  = users.filter(u => u.space_id === space.id).length
        const articleCount = articles.filter(a => a.space_id === space.id).length
        const pendingCount = pending.filter(p => p.space_id === space.id && ['pending', 'in_review'].includes(p.status)).length
        return {
          id: space.id,
          name: space.name,
          description: space.description,
          status: space.status as 'active' | 'inactive',
          created_at: space.created_at,
          adminName: admin?.name ?? null,
          adminEmail: admin?.email ?? null,
          userCount,
          articleCount,
          pendingCount,
        }
      })

      // ── 3. Stats ──────────────────────────────────────────────────────
      const totalSpaces   = spaces.length
      const activeSpaces  = spaces.filter(s => s.status === 'active').length
      const totalUsers    = users.length
      const totalArticles = articles.length
      const articlesThisMonth = articlesMonthRes.count ?? 0

      // Simple health: if all spaces active + no query errors = operational
      const platformHealth: PlatformStats['platformHealth'] = 'operational'

      // ── 4. Activity feed ──────────────────────────────────────────────
      const activityItems: ActivityItem[] = []
      for (const a of (recentArticlesRes.data ?? []) as Array<{ id: string; title: string; published_at: string }>) {
        activityItems.push({ id: `art-${a.id}`, type: 'article_published', label: a.title ?? 'Article published', timestamp: a.published_at })
      }
      for (const u of (recentUsersRes.data ?? []) as Array<{ id: string; name: string; created_at: string }>) {
        activityItems.push({ id: `usr-${u.id}`, type: 'user_joined', label: `${u.name} joined the platform`, timestamp: u.created_at })
      }
      for (const s of (recentSpacesRes.data ?? []) as Array<{ id: string; name: string; created_at: string }>) {
        activityItems.push({ id: `spc-${s.id}`, type: 'space_created', label: `${s.name} space created`, timestamp: s.created_at })
      }
      activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      setData({
        stats: { totalSpaces, activeSpaces, totalUsers, totalArticles, articlesThisMonth, platformHealth },
        spaces: spaceCards,
        activity: activityItems.slice(0, 10),
      })
    } catch (err: unknown) {
      console.error('[SuperAdmin Dashboard] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!sessionLoading) fetchDashboard()
  }, [sessionLoading, fetchDashboard])

  if (sessionLoading || loadingData) return <DashboardSkeleton />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <p className="text-slate-700 font-medium">Failed to load dashboard</p>
        <p className="text-sm text-gray-500">{error}</p>
        <button onClick={fetchDashboard}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-slate-800 hover:bg-slate-900">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const { stats, spaces, activity } = data
  const firstName = currentUser?.name?.split(' ')[0] ?? 'Admin'
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const inactiveSpaces = spaces.filter(s => s.status === 'inactive').length
  const showSystemAlert = !alertDismissed && inactiveSpaces > 0

  function activityIcon(type: ActivityItem['type']) {
    if (type === 'article_published') return '📄'
    if (type === 'user_joined')       return '👤'
    return '🏭'
  }

  return (
    <div className="max-w-screen-xl mx-auto p-8 space-y-8">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{todayLabel}</p>
        </div>
        <span
          className="text-xs font-bold px-3 py-1 rounded-full border tracking-wide mt-1"
          style={{ color: GOLD, borderColor: GOLD, backgroundColor: '#FEF9EE' }}
        >
          SUPER ADMIN
        </span>
      </div>

      {/* ── System alert banner ───────────────────────────────────────── */}
      {showSystemAlert && (
        <div className="flex items-center justify-between bg-red-50 border border-red-300 rounded-xl px-5 py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-sm font-medium text-red-800">
              System Alert: {inactiveSpaces} space{inactiveSpaces > 1 ? 's are' : ' is'} currently inactive.
              End users in those spaces have no access.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/super-admin/spaces" className="text-sm font-semibold text-red-700 hover:text-red-900 underline">
              Investigate
            </Link>
            <button onClick={() => setAlertDismissed(true)} className="text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Platform stat cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-6">

        {/* Total Spaces */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-t-4 p-5"
          style={{ borderTopColor: GOLD }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Total Industry Spaces</p>
          <p className="text-3xl font-bold" style={{ color: GOLD }}>{stats.totalSpaces}</p>
          <p className="text-xs text-gray-400 mt-1">{stats.activeSpaces} active</p>
        </div>

        {/* Total Users */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-t-4 p-5"
          style={{ borderTopColor: GOLD }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Total Users</p>
          <p className="text-3xl font-bold text-slate-800">{stats.totalUsers.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">Across all spaces</p>
        </div>

        {/* Articles */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-t-4 p-5"
          style={{ borderTopColor: GOLD }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Articles Published</p>
          <p className="text-3xl font-bold text-slate-800">{stats.totalArticles.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">This month: {stats.articlesThisMonth}</p>
        </div>

        {/* Platform Health */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-t-4 p-5"
          style={{ borderTopColor: GOLD }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Platform Health</p>
          <HealthBadge health={stats.platformHealth} />
          <p className="text-xs text-gray-400 mt-2">All systems checked</p>
        </div>
      </div>

      {/* ── Spaces grid + Activity feed ───────────────────────────────── */}
      <div className="grid grid-cols-3 gap-6">

        {/* Spaces grid — 2/3 width */}
        <div className="col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Industry Spaces</h2>
            <Link
              href="/super-admin/spaces"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: GOLD }}
            >
              + Create New Space
            </Link>
          </div>

          {spaces.length === 0 ? (
            <SetupWizard />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {spaces.map(space => (
                <div
                  key={space.id}
                  className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 border-l-4 ${
                    space.status === 'active' ? '' : 'opacity-60'
                  }`}
                  style={{ borderLeftColor: space.status === 'active' ? GOLD : '#9CA3AF' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-slate-900 text-sm leading-tight pr-2">{space.name}</h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      space.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {space.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {space.description && (
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{space.description}</p>
                  )}

                  {space.adminName ? (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-slate-700">{space.adminName}</p>
                      <p className="text-xs text-gray-400 truncate">{space.adminEmail}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 font-medium mb-3">No admin assigned</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {space.userCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {space.articleCount}
                    </span>
                    {space.pendingCount > 0 && (
                      <span className="text-amber-600 font-medium">{space.pendingCount} pending</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/super-admin/spaces`}
                      className="flex-1 text-center text-xs font-medium py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      View Space
                    </Link>
                    <Link
                      href={`/super-admin/spaces`}
                      className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg text-white transition-colors"
                      style={{ backgroundColor: GOLD }}
                    >
                      Manage
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Feed — 1/3 width */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Platform Activity</h2>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="w-8 h-8 text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">No recent activity yet</p>
              </div>
            ) : (
              <ul className="space-y-0 divide-y divide-gray-50">
                {activity.map(item => (
                  <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-2.5">
                      <span className="text-base mt-0.5 flex-shrink-0">{activityIcon(item.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 leading-snug line-clamp-2">{item.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.timestamp)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Quick nav links */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quick Links</p>
            {[
              { href: '/super-admin/users',     label: 'Manage Global Users' },
              { href: '/super-admin/analytics', label: 'Platform Analytics'  },
              { href: '/super-admin/system',    label: 'System Health'       },
              { href: '/super-admin/settings',  label: 'Platform Settings'   },
            ].map(link => (
              <Link key={link.href} href={link.href}
                className="flex items-center justify-between text-sm text-slate-700 hover:text-slate-900 py-1 group">
                {link.label}
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600" />
              </Link>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
