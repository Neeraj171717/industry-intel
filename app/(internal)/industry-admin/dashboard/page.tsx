'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Users, FileText, Inbox, Brain, ChevronRight,
  CheckCircle, XCircle, RefreshCw, AlertTriangle,
  UserPlus, BookOpen, Clock,
} from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import {
  getGreeting, timeAgo, formatDate,
  AI_TARGETS, getAiBrainHealth, HEALTH_CONFIG,
  type AiBrainHealth,
} from '@/lib/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  activeUsers: number
  pendingUsers: number
  articlesPublished: number
  publishedThisWeek: number
  pendingInbox: number
  tagAcceptanceRate: number
  duplicateAccuracyRate: number
  avgProcessingSecs: number
}

interface ActivityItem {
  id: string
  type: 'published' | 'joined' | 'submitted'
  label: string
  timestamp: string
}

interface PendingUser {
  id: string
  name: string
  email: string
  created_at: string
}

interface DashboardData {
  stats: DashboardStats
  activity: ActivityItem[]
  pendingApprovals: PendingUser[]
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonBox({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-lg ${className ?? ''}`} />
}

function DashboardSkeleton() {
  return (
    <div className="p-8 space-y-8">
      <div className="space-y-2">
        <SkeletonBox className="h-8 w-72" />
        <SkeletonBox className="h-4 w-48" />
      </div>
      <SkeletonBox className="h-12 w-full" />
      <div className="grid grid-cols-4 gap-6">
        {[0, 1, 2, 3].map(i => <SkeletonBox key={i} className="h-32" />)}
      </div>
      <SkeletonBox className="h-52 w-full" />
      <div className="grid grid-cols-2 gap-6">
        <SkeletonBox className="h-64" />
        <SkeletonBox className="h-64" />
      </div>
      <SkeletonBox className="h-64 w-full" />
    </div>
  )
}

// ─── Setup guide (new space) ──────────────────────────────────────────────────

function SetupGuide() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 max-w-lg mx-auto text-center">
      <Brain className="w-10 h-10 text-teal-500 mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Get your space ready</h2>
      <p className="text-sm text-gray-500 mb-6">No activity yet. Follow these steps to set things up.</p>
      <ol className="text-left space-y-3 text-sm text-slate-700">
        <li className="flex items-center gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">1</span>
          <Link href="/industry-admin/tags" className="underline hover:text-teal-600">Set up Tags</Link>
          <span className="text-gray-400">— define topics, severity, impact</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">2</span>
          <Link href="/industry-admin/sources" className="underline hover:text-teal-600">Add Sources</Link>
          <span className="text-gray-400">— RSS feeds, blogs, official channels</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">3</span>
          <Link href="/industry-admin/users" className="underline hover:text-teal-600">Invite Your Team</Link>
          <span className="text-gray-400">— editors, contributors, readers</span>
        </li>
      </ol>
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  value,
  target,
  healthyColor = 'bg-teal-500',
  warnColor = 'bg-amber-400',
}: {
  value: number
  target: number
  healthyColor?: string
  warnColor?: string
}) {
  const pct = Math.min(Math.round(value), 100)
  const isHealthy = value >= target
  return (
    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${isHealthy ? healthyColor : warnColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IndustryAdminDashboardPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    if (!currentUser?.space_id) return
    const supabase = createBrowserSupabaseClient()
    const spaceId = currentUser.space_id

    setLoadingData(true)
    setError(null)

    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [
        usersRes,
        articlesRes,
        articlesWeekRes,
        inboxRes,
        activityFinalRes,
        activityUsersRes,
        activityRawRes,
        pendingApprovalsRes,
        aiRawItemsRes,
      ] = await Promise.all([
        supabase.from('users').select('id, status').eq('space_id', spaceId).in('status', ['active', 'pending']),
        supabase.from('final_items').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).eq('status', 'published'),
        supabase.from('final_items').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).eq('status', 'published').gte('published_at', weekAgo),
        supabase.from('raw_items').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).in('status', ['pending', 'in_review']),
        supabase.from('final_items').select('id, title, published_at').eq('space_id', spaceId).eq('status', 'published').order('published_at', { ascending: false }).limit(10),
        supabase.from('users').select('id, name, created_at').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(10),
        supabase.from('raw_items').select('id, raw_text, created_at').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(10),
        supabase.from('users').select('id, name, email, created_at').eq('space_id', spaceId).eq('status', 'pending').order('created_at', { ascending: true }).limit(3),
        supabase.from('raw_items').select('id, created_at').eq('space_id', spaceId).eq('ai_processed', true).order('created_at', { ascending: false }).limit(50),
      ])

      const allUsers = (usersRes.data ?? []) as Array<{ id: string; status: string }>
      const activeUsers = allUsers.filter(u => u.status === 'active').length
      const pendingUsers = allUsers.filter(u => u.status === 'pending').length

      const articlesPublished = articlesRes.count ?? 0
      const publishedThisWeek = articlesWeekRes.count ?? 0
      const pendingInbox = inboxRes.count ?? 0

      const processedItems = (aiRawItemsRes.data ?? []) as Array<{ id: string; created_at: string }>
      const processedIds = processedItems.map(r => r.id)

      let tagAcceptanceRate = 0
      let duplicateAccuracyRate = 0
      let avgProcessingSecs = 0

      if (processedIds.length > 0) {
        const [tagSugRes, dupeSugRes, processingTimeSugRes] = await Promise.all([
          supabase.from('ai_suggestions').select('accepted').in('raw_item_id', processedIds).eq('suggestion_type', 'tag'),
          supabase.from('ai_suggestions').select('accepted').in('raw_item_id', processedIds).eq('suggestion_type', 'duplicate'),
          supabase.from('ai_suggestions').select('raw_item_id, created_at').in('raw_item_id', processedIds).order('created_at', { ascending: true }),
        ])

        const tagSugs = (tagSugRes.data ?? []) as Array<{ accepted: boolean | null }>
        if (tagSugs.length > 0) {
          tagAcceptanceRate = Math.round((tagSugs.filter(s => s.accepted === true).length / tagSugs.length) * 100)
        }

        const dupeSugs = (dupeSugRes.data ?? []) as Array<{ accepted: boolean | null }>
        if (dupeSugs.length > 0) {
          duplicateAccuracyRate = Math.round((dupeSugs.filter(s => s.accepted === true).length / dupeSugs.length) * 100)
        }

        const timeSugs = (processingTimeSugRes.data ?? []) as Array<{ raw_item_id: string; created_at: string }>
        const rawItemsMap = new Map<string, string>(processedItems.map(r => [r.id, r.created_at]))
        const firstSuggestionMap = new Map<string, string>()
        for (const sug of timeSugs) {
          if (!firstSuggestionMap.has(sug.raw_item_id)) {
            firstSuggestionMap.set(sug.raw_item_id, sug.created_at)
          }
        }
        const secsDiffs: number[] = []
        for (const [rawId, firstSugAt] of firstSuggestionMap.entries()) {
          const rawAt = rawItemsMap.get(rawId)
          if (rawAt) {
            const diff = (new Date(firstSugAt).getTime() - new Date(rawAt).getTime()) / 1000
            if (diff >= 0) secsDiffs.push(diff)
          }
        }
        if (secsDiffs.length > 0) {
          avgProcessingSecs = Math.round((secsDiffs.reduce((a, b) => a + b, 0) / secsDiffs.length) * 10) / 10
        }
      }

      // Build activity feed
      const activityItems: ActivityItem[] = []
      for (const item of (activityFinalRes.data ?? []) as Array<{ id: string; title: string; published_at: string }>) {
        activityItems.push({ id: `published-${item.id}`, type: 'published', label: item.title ?? 'Untitled article published', timestamp: item.published_at })
      }
      for (const u of (activityUsersRes.data ?? []) as Array<{ id: string; name: string; created_at: string }>) {
        activityItems.push({ id: `joined-${u.id}`, type: 'joined', label: `${u.name} joined the space`, timestamp: u.created_at })
      }
      for (const r of (activityRawRes.data ?? []) as Array<{ id: string; raw_text: string; created_at: string }>) {
        const snippet = typeof r.raw_text === 'string' ? r.raw_text.slice(0, 60) + (r.raw_text.length > 60 ? '…' : '') : 'Item submitted'
        activityItems.push({ id: `submitted-${r.id}`, type: 'submitted', label: `Submitted: ${snippet}`, timestamp: r.created_at })
      }
      activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      setData({
        stats: { activeUsers, pendingUsers, articlesPublished, publishedThisWeek, pendingInbox, tagAcceptanceRate, duplicateAccuracyRate, avgProcessingSecs },
        activity: activityItems.slice(0, 10),
        pendingApprovals: (pendingApprovalsRes.data ?? []) as PendingUser[],
      })
    } catch (err: unknown) {
      console.error('Dashboard fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setLoadingData(false)
    }
  }, [currentUser?.space_id])

  useEffect(() => {
    if (!sessionLoading && currentUser?.space_id) fetchDashboard()
  }, [sessionLoading, currentUser?.space_id, fetchDashboard])

  async function handleApprove(userId: string) {
    setApprovingId(userId)
    await createBrowserSupabaseClient().from('users').update({ status: 'active', role: 'user' }).eq('id', userId)
    setApprovingId(null)
    fetchDashboard()
  }

  async function handleReject(userId: string) {
    setRejectingId(userId)
    await createBrowserSupabaseClient().from('users').update({ status: 'suspended' }).eq('id', userId)
    setRejectingId(null)
    fetchDashboard()
  }

  if (sessionLoading || loadingData) return <DashboardSkeleton />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-8 gap-4">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <p className="text-slate-700 font-medium">Failed to load dashboard</p>
        <p className="text-sm text-gray-500">{error}</p>
        <button onClick={fetchDashboard} className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const { stats, activity, pendingApprovals } = data
  const isNewSpace = stats.activeUsers === 0 && stats.articlesPublished === 0 && stats.pendingInbox === 0
  const brainHealth: AiBrainHealth = getAiBrainHealth(stats.tagAcceptanceRate, stats.duplicateAccuracyRate, stats.avgProcessingSecs)
  const healthCfg = HEALTH_CONFIG[brainHealth]
  const firstName = currentUser?.name?.split(' ')[0] ?? 'Admin'
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  function activityIcon(type: ActivityItem['type']) {
    if (type === 'published') return <BookOpen className="w-4 h-4 text-teal-500" />
    if (type === 'joined') return <UserPlus className="w-4 h-4 text-purple-500" />
    return <Inbox className="w-4 h-4 text-amber-500" />
  }

  return (
    <div className="p-8 space-y-8 bg-white min-h-full">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{getGreeting()}, {firstName}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{todayLabel}</p>
      </div>

      {/* Amber pending-approvals banner */}
      {stats.pendingUsers > 0 && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-xl px-5 py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              You have {stats.pendingUsers} user{stats.pendingUsers > 1 ? 's' : ''} waiting for approval
            </span>
          </div>
          <Link href="/industry-admin/users" className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:text-amber-900 transition-colors">
            Review Now <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* New space setup guide */}
      {isNewSpace && <SetupGuide />}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Users</span>
            <Users className="w-4 h-4 text-gray-300" />
          </div>
          <p className="text-3xl font-bold text-teal-600">{stats.activeUsers}</p>
          {stats.pendingUsers > 0
            ? <p className="text-xs text-amber-600 font-medium">{stats.pendingUsers} pending</p>
            : <p className="text-xs text-gray-400">No pending users</p>}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Articles Published</span>
            <FileText className="w-4 h-4 text-gray-300" />
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.articlesPublished}</p>
          <p className="text-xs text-gray-400">This week: {stats.publishedThisWeek}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Editor Inbox</span>
            <Inbox className="w-4 h-4 text-gray-300" />
          </div>
          <p className={`text-3xl font-bold ${stats.pendingInbox > 0 ? 'text-amber-500' : 'text-slate-800'}`}>{stats.pendingInbox}</p>
          <p className="text-xs text-gray-400">Pending review</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">AI Brain Health</span>
            <Brain className="w-4 h-4 text-gray-300" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold border ${healthCfg.bg} ${healthCfg.text} ${healthCfg.border}`}>
              {healthCfg.label}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {brainHealth === 'good' ? 'All metrics on target' : brainHealth === 'warning' ? '1 metric needs attention' : '2+ metrics need attention'}
          </p>
        </div>
      </div>

      {/* AI Brain Performance */}
      <div className="bg-white border border-gray-200 border-l-4 border-l-teal-500 rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-teal-500" />
          <h2 className="text-base font-semibold text-slate-900">AI Brain Performance</h2>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700 font-medium">Tag Acceptance Rate</span>
            <span className={`font-semibold ${stats.tagAcceptanceRate >= AI_TARGETS.tagAcceptance ? 'text-teal-600' : 'text-amber-500'}`}>
              {stats.tagAcceptanceRate}%
              <span className="text-gray-400 font-normal ml-1">/ target {AI_TARGETS.tagAcceptance}%</span>
            </span>
          </div>
          <ProgressBar value={stats.tagAcceptanceRate} target={AI_TARGETS.tagAcceptance} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700 font-medium">Duplicate Detection Accuracy</span>
            <span className={`font-semibold ${stats.duplicateAccuracyRate >= AI_TARGETS.duplicateAccuracy ? 'text-teal-600' : 'text-amber-500'}`}>
              {stats.duplicateAccuracyRate}%
              <span className="text-gray-400 font-normal ml-1">/ target {AI_TARGETS.duplicateAccuracy}%</span>
            </span>
          </div>
          <ProgressBar value={stats.duplicateAccuracyRate} target={AI_TARGETS.duplicateAccuracy} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-slate-700 font-medium">Avg Processing Time</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${stats.avgProcessingSecs === 0 || stats.avgProcessingSecs <= AI_TARGETS.processingTimeSecs ? 'text-teal-600' : 'text-red-500'}`}>
              {stats.avgProcessingSecs > 0 ? `${stats.avgProcessingSecs}s` : '—'}
            </span>
            <span className="text-xs text-gray-400">/ target &lt;{AI_TARGETS.processingTimeSecs}s</span>
            {stats.avgProcessingSecs > 0 && (
              stats.avgProcessingSecs <= AI_TARGETS.processingTimeSecs
                ? <CheckCircle className="w-4 h-4 text-teal-500" />
                : <XCircle className="w-4 h-4 text-red-400" />
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions + Pending Approvals */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/editor/inbox" className="flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors">
              <Inbox className="w-4 h-4" /> Review Inbox
            </Link>
            <Link href="/industry-admin/users" className="flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-teal-600 text-teal-600 rounded-lg text-sm font-medium hover:bg-teal-50 transition-colors">
              <Users className="w-4 h-4" /> Manage Users
            </Link>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Pending Approvals</h2>
            {pendingApprovals.length > 0 && (
              <Link href="/industry-admin/users" className="text-xs text-teal-600 hover:underline font-medium">View all</Link>
            )}
          </div>
          {pendingApprovals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle className="w-8 h-8 text-teal-300 mb-2" />
              <p className="text-sm text-gray-400">No pending approvals</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {pendingApprovals.map(u => (
                <li key={u.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    <p className="text-xs text-gray-400">Joined {formatDate(u.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => handleApprove(u.id)} disabled={approvingId === u.id}
                      className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors">
                      {approvingId === u.id ? '…' : 'Approve'}
                    </button>
                    <button onClick={() => handleReject(u.id)} disabled={rejectingId === u.id}
                      className="px-3 py-1.5 text-red-500 hover:text-red-700 text-xs font-semibold disabled:opacity-50 transition-colors">
                      {rejectingId === u.id ? '…' : 'Reject'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No recent activity yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {activity.map(item => (
              <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex-shrink-0">{activityIcon(item.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">{item.label}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{timeAgo(item.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  )
}
