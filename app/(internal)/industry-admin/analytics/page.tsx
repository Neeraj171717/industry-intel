'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, CheckCircle, XCircle, TrendingUp, TrendingDown } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { AI_TARGETS } from '@/lib/admin'

type DateRange = 'week' | 'month' | '3months'

const DATE_RANGES: { key: DateRange; label: string; days: number }[] = [
  { key: 'week',    label: 'This Week',     days: 7  },
  { key: 'month',   label: 'This Month',    days: 30 },
  { key: '3months', label: 'Last 3 Months', days: 90 },
]

// ─── Simple bar chart ─────────────────────────────────────────────────────────
function BarChart({ data, maxVal, color = 'bg-teal-500' }: {
  data: { label: string; value: number }[]
  maxVal?: number
  color?: string
}) {
  const max = maxVal ?? Math.max(...data.map(d => d.value), 1)
  return (
    <div className="space-y-2">
      {data.map(({ label, value }) => (
        <div key={label} className="flex items-center gap-3">
          <p className="text-xs text-gray-500 w-20 text-right flex-shrink-0 truncate">{label}</p>
          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-5 rounded-full transition-all ${color}`}
              style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs font-semibold text-slate-700 w-8 text-right flex-shrink-0">{value}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function MetricBar({ label, value, target, unit = '%', invert = false }: {
  label: string; value: number; target: number; unit?: string; invert?: boolean
}) {
  const pct = unit === '%' ? value : Math.min((target / Math.max(value, 1)) * 100, 100)
  const pass = invert ? value <= target : value >= target
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-44 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full ${pass ? 'bg-teal-500' : 'bg-amber-400'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-16 text-right flex-shrink-0">
        {unit === 's' ? `${value.toFixed(1)}s` : `${Math.round(value)}%`}
      </span>
      <span className={`text-xs flex-shrink-0 ${pass ? 'text-teal-600' : 'text-amber-600'}`}>
        {pass ? <CheckCircle size={13} /> : <XCircle size={13} />}
      </span>
    </div>
  )
}

// ─── Section skeleton ─────────────────────────────────────────────────────────
function SectionSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="h-5 w-48 bg-gray-200 rounded animate-pulse mb-4" />
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />)}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [range, setRange] = useState<DateRange>('month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Engagement
  const [dauData, setDauData] = useState<{ label: string; value: number }[]>([])
  const [readCount, setReadCount] = useState(0)
  const [skipCount, setSkipCount] = useState(0)

  // Content
  const [weeklyArticles, setWeeklyArticles] = useState<{ label: string; value: number }[]>([])
  const [topRead, setTopRead] = useState<{ id: string; title: string; count: number; published_at: string }[]>([])
  const [topSaved, setTopSaved] = useState<{ id: string; title: string; count: number; published_at: string }[]>([])

  // AI Brain
  const [tagAcceptance, setTagAcceptance] = useState(0)
  const [dupeAccuracy, setDupeAccuracy] = useState(0)
  const [avgProcessingSecs, setAvgProcessingSecs] = useState(0)
  const [aiTrend, setAiTrend] = useState<{ label: string; value: number }[]>([])

  // Team
  const [teamData, setTeamData] = useState<{
    name: string; submitted: number; published: number; rejected: number; rate: number
  }[]>([])

  const load = useCallback(async () => {
    if (!currentUser?.space_id) return
    setLoading(true); setError(null)
    const supabase = createBrowserSupabaseClient()
    const spaceId = currentUser.space_id
    const days = DATE_RANGES.find(d => d.key === range)!.days
    const since = new Date(Date.now() - days * 86400000).toISOString()

    try {
      // ── Fetch base data ──────────────────────────────────────────────────
      const [
        { data: finalItems },
        { data: interactions },
        { data: rawItems },
        { data: spaceUsers },
        { data: suggestions },
        { data: rawAllItems },
      ] = await Promise.all([
        supabase.from('final_items').select('id, title, published_at, severity').eq('space_id', spaceId).gte('published_at', since),
        supabase.from('user_interactions').select('user_id, final_item_id, action, interacted_at, thread_id'),
        supabase.from('raw_items').select('id, submitted_by, status, created_at, ai_processed').eq('space_id', spaceId).gte('created_at', since),
        supabase.from('users').select('id, name, role').eq('space_id', spaceId).in('role', ['contributor', 'editor']),
        supabase.from('ai_suggestions').select('id, raw_item_id, suggestion_type, accepted, created_at'),
        supabase.from('raw_items').select('id, created_at, ai_processed').eq('space_id', spaceId).eq('ai_processed', true),
      ])

      const finalItemIds = new Set((finalItems ?? []).map(f => f.id))
      const spaceInteractions = (interactions ?? []).filter(i => finalItemIds.has(i.final_item_id))
      const spaceRawIds = new Set((rawAllItems ?? []).map(r => r.id))
      const spaceSuggestions = (suggestions ?? []).filter(s => spaceRawIds.has(s.raw_item_id))

      // ── User Engagement ──────────────────────────────────────────────────
      const reads = spaceInteractions.filter(i => i.action === 'read')
      const skips = spaceInteractions.filter(i => i.action === 'ignored')
      setReadCount(reads.length)
      setSkipCount(skips.length)

      // DAU: group by date
      const dauMap: Record<string, Set<string>> = {}
      for (const i of spaceInteractions) {
        const day = i.interacted_at?.slice(0, 10)
        if (!day) continue
        if (!dauMap[day]) dauMap[day] = new Set()
        dauMap[day].add(i.user_id)
      }
      const dauArr = Object.entries(dauMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([date, users]) => ({
          label: new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          value: users.size,
        }))
      setDauData(dauArr)

      // ── Content Performance ──────────────────────────────────────────────
      // Articles per week
      const weekMap: Record<string, number> = {}
      for (const f of (finalItems ?? [])) {
        const d = new Date(f.published_at)
        const week = `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString('en-GB', { month: 'short' })}`
        weekMap[week] = (weekMap[week] ?? 0) + 1
      }
      setWeeklyArticles(Object.entries(weekMap).slice(-8).map(([label, value]) => ({ label, value })))

      // Top 5 most read / saved
      const readMap: Record<string, number> = {}
      const savedMap: Record<string, number> = {}
      for (const i of spaceInteractions) {
        if (i.action === 'read') readMap[i.final_item_id] = (readMap[i.final_item_id] ?? 0) + 1
        if (i.action === 'saved') savedMap[i.final_item_id] = (savedMap[i.final_item_id] ?? 0) + 1
      }
      const fiMap = Object.fromEntries((finalItems ?? []).map(f => [f.id, f]))
      const topR = Object.entries(readMap)
        .sort(([, a], [, b]) => b - a).slice(0, 5)
        .map(([id, count]) => ({ id, title: fiMap[id]?.title ?? id, count, published_at: fiMap[id]?.published_at ?? '' }))
      const topS = Object.entries(savedMap)
        .sort(([, a], [, b]) => b - a).slice(0, 5)
        .map(([id, count]) => ({ id, title: fiMap[id]?.title ?? id, count, published_at: fiMap[id]?.published_at ?? '' }))
      setTopRead(topR)
      setTopSaved(topS)

      // ── AI Brain ─────────────────────────────────────────────────────────
      const tagSugs = spaceSuggestions.filter(s => s.suggestion_type === 'tag')
      const dupeSugs = spaceSuggestions.filter(s => s.suggestion_type === 'duplicate')
      const tagAccRate = tagSugs.length > 0
        ? (tagSugs.filter(s => s.accepted === true).length / tagSugs.length) * 100
        : 0
      const dupeAccRate = dupeSugs.length > 0
        ? (dupeSugs.filter(s => s.accepted === true).length / dupeSugs.length) * 100
        : 0
      setTagAcceptance(tagAccRate)
      setDupeAccuracy(dupeAccRate)

      // Avg processing time: diff between raw_item created_at and first suggestion created_at
      const rawMap = Object.fromEntries((rawAllItems ?? []).map(r => [r.id, r]))
      const timesByItem: Record<string, number[]> = {}
      for (const s of spaceSuggestions) {
        if (!timesByItem[s.raw_item_id]) timesByItem[s.raw_item_id] = []
        timesByItem[s.raw_item_id].push(new Date(s.created_at).getTime())
      }
      const diffs: number[] = []
      for (const [rawId, times] of Object.entries(timesByItem)) {
        const raw = rawMap[rawId]
        if (!raw) continue
        const earliest = Math.min(...times)
        const created = new Date(raw.created_at).getTime()
        diffs.push((earliest - created) / 1000)
      }
      setAvgProcessingSecs(diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0)

      // AI trend — tag acceptance by week
      const trendMap: Record<string, { accepted: number; total: number }> = {}
      for (const s of tagSugs) {
        const d = new Date(s.created_at)
        const wk = `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString('en-GB', { month: 'short' })}`
        if (!trendMap[wk]) trendMap[wk] = { accepted: 0, total: 0 }
        trendMap[wk].total++
        if (s.accepted === true) trendMap[wk].accepted++
      }
      setAiTrend(Object.entries(trendMap).slice(-8).map(([label, { accepted, total }]) => ({
        label,
        value: total > 0 ? Math.round((accepted / total) * 100) : 0,
      })))

      // ── Team Performance ─────────────────────────────────────────────────
      const rawByUser: Record<string, { submitted: number; published: number; rejected: number }> = {}
      for (const r of (rawItems ?? [])) {
        if (!rawByUser[r.submitted_by]) rawByUser[r.submitted_by] = { submitted: 0, published: 0, rejected: 0 }
        rawByUser[r.submitted_by].submitted++
        if (r.status === 'processed') rawByUser[r.submitted_by].published++
        if (r.status === 'rejected') rawByUser[r.submitted_by].rejected++
      }
      const contribs = (spaceUsers ?? []).filter(u => u.role === 'contributor')
      setTeamData(contribs.map(u => {
        const stats = rawByUser[u.id] ?? { submitted: 0, published: 0, rejected: 0 }
        return {
          name: u.name,
          ...stats,
          rate: stats.submitted > 0 ? Math.round((stats.published / stats.submitted) * 100) : 0,
        }
      }).filter(u => u.submitted > 0))

    } catch (e) {
      console.error('[Analytics] error:', e)
      setError('Failed to load analytics data.')
    } finally {
      setLoading(false)
    }
  }, [currentUser, range])

  useEffect(() => {
    if (!sessionLoading && currentUser) load()
  }, [sessionLoading, currentUser, load])

  if (sessionLoading) return (
    <div className="p-8 space-y-6">{[1,2,3].map(i => <SectionSkeleton key={i} />)}</div>
  )
  if (!currentUser) return null

  const totalInteractions = readCount + skipCount
  const readPct = totalInteractions > 0 ? Math.round((readCount / totalInteractions) * 100) : 0

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {DATE_RANGES.map(({ key, label }) => (
            <button key={key} onClick={() => setRange(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === key ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
          <AlertCircle size={16} className="text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-6">{[1,2,3,4,5].map(i => <SectionSkeleton key={i} />)}</div>
      ) : (
        <div className="space-y-6">

          {/* S1 — User Engagement */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-5">User Engagement</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Daily Active Users</p>
                {dauData.length === 0
                  ? <p className="text-xs text-gray-400">No interaction data for this period.</p>
                  : <BarChart data={dauData} color="bg-teal-500" />
                }
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Read vs Skip Ratio</p>
                {totalInteractions === 0
                  ? <p className="text-xs text-gray-400">No interactions recorded yet.</p>
                  : (
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Read</span><span>{readCount} ({readPct}%)</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-3 bg-green-500 rounded-full" style={{ width: `${readPct}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Skipped</span><span>{skipCount} ({100 - readPct}%)</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-3 bg-gray-400 rounded-full" style={{ width: `${100 - readPct}%` }} />
                        </div>
                      </div>
                      {readPct < 40 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                          <p className="text-xs text-amber-700">Feed engagement is below target (40%). Consider reviewing your tag taxonomy or increasing content frequency.</p>
                        </div>
                      )}
                    </div>
                  )
                }
              </div>
            </div>
          </div>

          {/* S2 — Content Performance */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-5">Content Performance</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Articles Published</p>
                {weeklyArticles.length === 0
                  ? <p className="text-xs text-gray-400">No articles published in this period.</p>
                  : <BarChart data={weeklyArticles} color="bg-slate-700" />
                }
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top 5 Most Read</p>
                {topRead.length === 0
                  ? <p className="text-xs text-gray-400">No read data yet.</p>
                  : (
                    <div className="space-y-2">
                      {topRead.map((item, i) => (
                        <div key={item.id} className="flex items-start gap-2">
                          <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0 mt-0.5">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-700 line-clamp-2">{item.title}</p>
                            <p className="text-xs text-gray-400">{item.count} read{item.count !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top 5 Most Saved</p>
                {topSaved.length === 0
                  ? <p className="text-xs text-gray-400">No save data yet.</p>
                  : (
                    <div className="space-y-2">
                      {topSaved.map((item, i) => (
                        <div key={item.id} className="flex items-start gap-2">
                          <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0 mt-0.5">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-700 line-clamp-2">{item.title}</p>
                            <p className="text-xs text-gray-400">{item.count} save{item.count !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
            </div>
          </div>

          {/* S3 — AI Brain Performance */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-5">AI Brain Performance</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Current Metrics vs Targets</p>
                <div className="space-y-3">
                  <MetricBar label="Tag Acceptance Rate" value={tagAcceptance} target={AI_TARGETS.tagAcceptance} />
                  <MetricBar label="Duplicate Detection Accuracy" value={dupeAccuracy} target={AI_TARGETS.duplicateAccuracy} />
                  <MetricBar label="Avg Processing Time" value={avgProcessingSecs} target={AI_TARGETS.processingTimeSecs} unit="s" invert />
                </div>
                <div className="mt-4 text-xs text-gray-400 space-y-0.5">
                  <p>Targets: Tag acceptance ≥{AI_TARGETS.tagAcceptance}% · Dupe accuracy ≥{AI_TARGETS.duplicateAccuracy}% · Processing &lt;{AI_TARGETS.processingTimeSecs}s</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tag Acceptance Trend</p>
                {aiTrend.length === 0
                  ? <p className="text-xs text-gray-400">Not enough data for trend analysis.</p>
                  : <BarChart data={aiTrend} maxVal={100} color="bg-purple-500" />
                }
              </div>
            </div>
          </div>

          {/* S4 — Team Performance */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Team Performance</h2>
            <p className="text-xs text-gray-400 mb-5">For internal use only — not for punitive purposes.</p>
            {teamData.length === 0 ? (
              <p className="text-sm text-gray-400">No contributor activity in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Contributor</th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Submitted</th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Published</th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Rejected</th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Pub Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {teamData.map(row => (
                      <tr key={row.name} className="hover:bg-gray-50">
                        <td className="py-3 text-sm font-medium text-slate-800">{row.name}</td>
                        <td className="py-3 text-sm text-slate-700 text-right">{row.submitted}</td>
                        <td className="py-3 text-sm text-green-700 text-right">{row.published}</td>
                        <td className="py-3 text-sm text-red-600 text-right">{row.rejected}</td>
                        <td className="py-3 text-right">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            row.rate >= 70 ? 'bg-green-100 text-green-700'
                            : row.rate >= 40 ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                          }`}>
                            {row.rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
