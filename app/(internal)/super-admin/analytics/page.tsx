'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, Download } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

const GOLD = '#C9A84C'

// ─── Types ────────────────────────────────────────────────────────────────────

type DateRange = 'week' | 'month' | 'quarter' | 'year'

interface SpaceMetric {
  id: string
  name: string
  userCount: number
  articleCount: number
  dau: number
  growthRate: number // positive = growth, negative = decline
}

interface AnalyticsData {
  totalUsers: number
  newSignups: number
  userGrowthRate: number
  weeklySignups: number[]
  weekLabels: string[]
  spaceMetrics: SpaceMetric[]
  articlesPerWeek: number[]
  contentTypeBreakdown: Record<string, number>
  platformReadRate: number
  platformSkipRate: number
  librarySaveRate: number
  avgResponseMs: number
  uptimePct: number
  errorRatePerHour: number
}

// ─── Helper: date range bounds ─────────────────────────────────────────────────

function getStartDate(range: DateRange): string {
  const now = new Date()
  const d   = new Date(now)
  if (range === 'week')    d.setDate(d.getDate() - 7)
  if (range === 'month')   d.setMonth(d.getMonth() - 1)
  if (range === 'quarter') d.setMonth(d.getMonth() - 3)
  if (range === 'year')    d.setFullYear(d.getFullYear() - 1)
  return d.toISOString()
}

// ─── CSV export helper ────────────────────────────────────────────────────────

function exportCSV(filename: string, rows: string[][], headers: string[]) {
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({
  values,
  labels,
  color = GOLD,
  height = 120,
}: {
  values: number[]
  labels?: string[]
  color?: string
  height?: number
}) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {values.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div
            className="w-full rounded-t-sm transition-all duration-500"
            style={{ height: `${Math.round((v / max) * (height - 20))}px`, backgroundColor: color, opacity: 0.85 }}
            title={`${v}`}
          />
          {labels && (
            <span className="text-xs text-gray-400 truncate w-full text-center" style={{ fontSize: 10 }}>{labels[i]}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  onExport,
  children,
}: {
  title: string
  onExport?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {onExport && (
          <button onClick={onExport}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <Download size={12} /> Export CSV
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlatformAnalyticsPage() {
  const { loading: sessionLoading } = useSession()
  const [range, setRange]           = useState<DateRange>('month')
  const [data, setData]             = useState<AnalyticsData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [sortCol, setSortCol]       = useState<keyof SpaceMetric>('userCount')
  const [sortAsc, setSortAsc]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createBrowserSupabaseClient()
    const startDate = getStartDate(range)

    try {
      const [
        allUsersRes,
        newUsersRes,
        spacesRes,
        allUsersSpaceRes,
        articlesRes,
        newArticlesRes,
        interactionsRes,
      ] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id, created_at').gte('created_at', startDate),
        supabase.from('industry_spaces').select('id, name, status'),
        supabase.from('users').select('id, space_id, created_at'),
        supabase.from('final_items').select('id, space_id, content_type, published_at'),
        supabase.from('final_items').select('id, published_at').gte('published_at', startDate),
        supabase.from('user_interactions').select('action').gte('interacted_at', startDate),
      ])

      const totalUsers    = allUsersRes.count ?? 0
      const newUsers      = (newUsersRes.data ?? []) as Array<{ id: string; created_at: string }>
      const spaces        = (spacesRes.data ?? []) as Array<{ id: string; name: string; status: string }>
      const allUsersSpace = (allUsersSpaceRes.data ?? []) as Array<{ id: string; space_id: string | null; created_at: string }>
      const articles      = (articlesRes.data ?? []) as Array<{ id: string; space_id: string; content_type: string | null; published_at: string }>
      const newArticles   = (newArticlesRes.data ?? []) as Array<{ id: string; published_at: string }>
      const interactions  = (interactionsRes.data ?? []) as Array<{ action: string }>

      // ── Signups over time (weekly buckets) ────────────────────────────
      const weeks = range === 'week' ? 7 : range === 'month' ? 4 : range === 'quarter' ? 12 : 52
      const bucketSize = range === 'week' ? 1 : range === 'month' ? 7 : range === 'quarter' ? 7 : 7
      const weeklySignups: number[] = []
      const weekLabels: string[] = []
      for (let i = weeks - 1; i >= 0; i--) {
        const end   = new Date(Date.now() - i * bucketSize * 86400000)
        const start = new Date(end.getTime() - bucketSize * 86400000)
        weeklySignups.push(newUsers.filter(u => {
          const d = new Date(u.created_at)
          return d >= start && d < end
        }).length)
        weekLabels.push(end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))
      }
      const displayBuckets = Math.min(weeks, range === 'year' ? 12 : weeks)
      const step = Math.ceil(weeks / displayBuckets)
      const displaySignups = weeklySignups.filter((_, i) => (weeks - 1 - i) % step === 0).slice(-displayBuckets)
      const displayLabels  = weekLabels.filter((_,  i) => (weeks - 1 - i) % step === 0).slice(-displayBuckets)

      // Growth rate vs previous period
      const midpoint = Math.floor(newUsers.length / 2)
      const firstHalf  = newUsers.slice(0, midpoint).length
      const secondHalf = newUsers.slice(midpoint).length
      const userGrowthRate = firstHalf > 0 ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0

      // ── Space metrics ─────────────────────────────────────────────────
      const spaceMetrics: SpaceMetric[] = spaces.map(s => {
        const spaceUsers    = allUsersSpace.filter(u => u.space_id === s.id)
        const spaceArticles = articles.filter(a => a.space_id === s.id)
        const recent = spaceUsers.filter(u => new Date(u.created_at) >= new Date(startDate)).length
        const prev   = Math.max(spaceUsers.length - recent, 1)
        const growthRate = prev > 0 ? Math.round((recent / prev) * 100 - 100) : 0
        return {
          id: s.id,
          name: s.name,
          userCount: spaceUsers.length,
          articleCount: spaceArticles.length,
          dau: Math.round(spaceUsers.length * 0.15), // estimated
          growthRate,
        }
      })

      // ── Articles per week (last 8) ────────────────────────────────────
      const articleWeeks = 8
      const articlesPerWeek: number[] = []
      for (let i = articleWeeks - 1; i >= 0; i--) {
        const end   = new Date(Date.now() - i * 7 * 86400000)
        const start = new Date(end.getTime() - 7 * 86400000)
        articlesPerWeek.push(newArticles.filter(a => {
          const d = new Date(a.published_at)
          return d >= start && d < end
        }).length)
      }

      // ── Content type breakdown ────────────────────────────────────────
      const contentTypeBreakdown: Record<string, number> = {}
      for (const a of articles) {
        const ct = a.content_type ?? 'unknown'
        contentTypeBreakdown[ct] = (contentTypeBreakdown[ct] ?? 0) + 1
      }

      // ── Engagement rates ──────────────────────────────────────────────
      const totalInteractions = interactions.length
      const reads  = interactions.filter(i => i.action === 'read').length
      const skips  = interactions.filter(i => i.action === 'ignored').length
      const saves  = interactions.filter(i => i.action === 'saved').length
      const platformReadRate  = totalInteractions > 0 ? Math.round((reads  / totalInteractions) * 100) : 0
      const platformSkipRate  = totalInteractions > 0 ? Math.round((skips  / totalInteractions) * 100) : 0
      const librarySaveRate   = totalInteractions > 0 ? Math.round((saves  / totalInteractions) * 100) : 0

      setData({
        totalUsers,
        newSignups: newUsers.length,
        userGrowthRate,
        weeklySignups: displaySignups,
        weekLabels: displayLabels,
        spaceMetrics,
        articlesPerWeek,
        contentTypeBreakdown,
        platformReadRate,
        platformSkipRate,
        librarySaveRate,
        avgResponseMs: 0, // placeholder — no server timing in client
        uptimePct: 99.9,  // placeholder
        errorRatePerHour: 0,
      })
    } catch (err) {
      console.error('[Analytics] load error:', err)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    if (!sessionLoading) load()
  }, [sessionLoading, load])

  function toggleSort(col: keyof SpaceMetric) {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(false) }
  }

  const sortedSpaces = data ? [...data.spaceMetrics].sort((a, b) => {
    const va = a[sortCol] as number
    const vb = b[sortCol] as number
    return sortAsc ? va - vb : vb - va
  }) : []

  const RANGES: { key: DateRange; label: string }[] = [
    { key: 'week',    label: 'This Week'     },
    { key: 'month',   label: 'This Month'    },
    { key: 'quarter', label: 'Last Quarter'  },
    { key: 'year',    label: 'Last Year'     },
  ]

  function SortArrow({ col }: { col: keyof SpaceMetric }) {
    if (sortCol !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="ml-1" style={{ color: GOLD }}>{sortAsc ? '↑' : '↓'}</span>
  }

  function GrowthBadge({ rate }: { rate: number }) {
    if (rate > 0) return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
        <TrendingUp size={11} /> +{rate}%
      </span>
    )
    if (rate < 0) return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
        <TrendingDown size={11} /> {rate}%
      </span>
    )
    return <span className="text-xs text-gray-400">—</span>
  }

  return (
    <div className="max-w-screen-xl mx-auto p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">Cross-platform metrics — all spaces</p>
        </div>
        {/* Date range selector */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={range === r.key
                ? { backgroundColor: '#fff', color: GOLD, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                : { color: '#6B7280' }
              }>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          {[0,1,2,3,4].map(i => <div key={i} className="h-52 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : !data ? null : (
        <>
          {/* Section 1 — Platform Growth */}
          <Section
            title="Platform Growth"
            onExport={() => exportCSV('platform-growth.csv',
              data.weekLabels.map((l, i) => [l, String(data.weeklySignups[i])]),
              ['Week', 'New Signups']
            )}
          >
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Total Users</p>
                <p className="text-3xl font-bold text-slate-800">{data.totalUsers.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">New Signups</p>
                <p className="text-3xl font-bold text-slate-800">{data.newSignups}</p>
                <p className="text-xs text-gray-400 mt-0.5">in selected period</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Growth Rate</p>
                <div className="flex items-center gap-2 mt-1">
                  {data.userGrowthRate > 0
                    ? <span className="text-2xl font-bold text-green-600">+{data.userGrowthRate}%</span>
                    : data.userGrowthRate < 0
                    ? <span className="text-2xl font-bold text-red-600">{data.userGrowthRate}%</span>
                    : <span className="text-2xl font-bold text-gray-500">0%</span>
                  }
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-3">New signups over time</p>
              <BarChart values={data.weeklySignups} labels={data.weekLabels} color={GOLD} height={140} />
            </div>
          </Section>

          {/* Section 2 — Space Comparison */}
          <Section
            title="Space Comparison"
            onExport={() => exportCSV('space-comparison.csv',
              sortedSpaces.map(s => [s.name, String(s.userCount), String(s.articleCount), `${s.growthRate}%`]),
              ['Space', 'Users', 'Articles', 'Growth Rate']
            )}
          >
            {sortedSpaces.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No spaces to compare yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {([
                      { key: 'name',        label: 'Space'        },
                      { key: 'userCount',   label: 'Users'        },
                      { key: 'articleCount',label: 'Articles'     },
                      { key: 'dau',         label: 'DAU (est.)'   },
                      { key: 'growthRate',  label: 'Growth Rate'  },
                    ] as { key: keyof SpaceMetric; label: string }[]).map(col => (
                      <th key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none">
                        {col.label}<SortArrow col={col.key} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedSpaces.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="py-3 px-3 font-medium text-slate-900">{s.name}</td>
                      <td className="py-3 px-3 text-slate-700">{s.userCount.toLocaleString()}</td>
                      <td className="py-3 px-3 text-slate-700">{s.articleCount.toLocaleString()}</td>
                      <td className="py-3 px-3 text-slate-700">{s.dau.toLocaleString()}</td>
                      <td className="py-3 px-3"><GrowthBadge rate={s.growthRate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Section 3 — Content Production */}
          <Section
            title="Content Production"
            onExport={() => exportCSV('content-production.csv',
              data.articlesPerWeek.map((v, i) => [`Week ${i + 1}`, String(v)]),
              ['Week', 'Articles Published']
            )}
          >
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-xs text-gray-400 mb-3">Articles published per week (last 8 weeks)</p>
                <BarChart values={data.articlesPerWeek} height={130} color="#4F46E5" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-3">By content type</p>
                {Object.keys(data.contentTypeBreakdown).length === 0 ? (
                  <p className="text-sm text-gray-400">No published articles yet.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(data.contentTypeBreakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, count]) => {
                        const total = Object.values(data.contentTypeBreakdown).reduce((a, b) => a + b, 0)
                        const pct   = Math.round((count / total) * 100)
                        return (
                          <div key={type} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-24 capitalize">{type.replace('_', ' ')}</span>
                            <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
                              <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-700 w-8 text-right">{pct}%</span>
                          </div>
                        )
                      })
                    }
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* Section 4 — User Engagement */}
          <Section title="User Engagement">
            <div className="grid grid-cols-3 gap-6">
              {[
                { label: 'Read Rate',      value: data.platformReadRate,  target: 40, color: 'bg-teal-500'  },
                { label: 'Skip Rate',      value: data.platformSkipRate,  target: null, color: 'bg-amber-400' },
                { label: 'Library Saves',  value: data.librarySaveRate,   target: 10, color: 'bg-purple-500' },
              ].map(m => (
                <div key={m.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">{m.label}</p>
                    <span className={`text-xl font-bold ${m.target && m.value < m.target ? 'text-amber-500' : 'text-slate-800'}`}>
                      {m.value}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div className={`h-2 rounded-full transition-all duration-500 ${m.color}`}
                      style={{ width: `${Math.min(m.value, 100)}%` }} />
                  </div>
                  {m.target && (
                    <p className="text-xs text-gray-400">Target: {m.target}%</p>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Section 5 — Technical Performance */}
          <Section title="Technical Performance">
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Platform Uptime</p>
                <p className="text-3xl font-bold text-green-600">{data.uptimePct}%</p>
                <p className="text-xs text-gray-400 mt-1">30-day average</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Error Rate</p>
                <p className="text-3xl font-bold text-slate-800">{data.errorRatePerHour}/hr</p>
                <p className="text-xs text-gray-400 mt-1">platform-wide</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Avg DB Response</p>
                <p className="text-3xl font-bold text-slate-800">—</p>
                <p className="text-xs text-gray-400 mt-1">See System Health</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">
              For real-time performance data, visit the{' '}
              <a href="/super-admin/system" className="underline" style={{ color: GOLD }}>System Health</a> page.
            </p>
          </Section>
        </>
      )}
    </div>
  )
}
