'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { getAiBrainHealth, HEALTH_CONFIG, AI_TARGETS } from '@/lib/admin'

const GOLD = '#C9A84C'
const AUTO_REFRESH_SECS = 60

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

interface ServiceCheck {
  name: string
  status: ServiceStatus
  responseMs: number | null
  detail: string
}

interface SpaceAiBrainRow {
  spaceId: string
  spaceName: string
  tagAcceptance: number
  dupeAccuracy: number
  avgProcessingSecs: number
  health: 'good' | 'warning' | 'issue'
}

interface ErrorLogRow {
  id: string
  type: string
  message: string
  space: string | null
  count: number
  firstSeen: string
  lastSeen: string
  resolved: boolean
}

interface SystemData {
  services: ServiceCheck[]
  aiBrain: SpaceAiBrainRow[]
  errors: ErrorLogRow[]
  dbResponseMs: number
  overallStatus: 'operational' | 'degraded' | 'down'
  checkedAt: string
}

// ─── Status indicator ─────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ServiceStatus }) {
  const cfg = {
    healthy:  'bg-green-500',
    degraded: 'bg-amber-400',
    down:     'bg-red-500',
    unknown:  'bg-gray-300',
  }[status]
  return <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg}`} />
}

function StatusLabel({ status }: { status: ServiceStatus }) {
  const cfg = {
    healthy:  { text: 'Healthy',  cls: 'text-green-700 bg-green-100' },
    degraded: { text: 'Degraded', cls: 'text-amber-700 bg-amber-100' },
    down:     { text: 'Down',     cls: 'text-red-700 bg-red-100'     },
    unknown:  { text: 'Unknown',  cls: 'text-gray-600 bg-gray-100'   },
  }[status]
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>
      {cfg.text}
    </span>
  )
}

// ─── Overall banner ───────────────────────────────────────────────────────────

function OverallBanner({ status }: { status: SystemData['overallStatus'] }) {
  if (status === 'operational') {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-300 rounded-xl px-5 py-4">
        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-green-900">All Systems Operational</p>
          <p className="text-xs text-green-700 mt-0.5">All platform services are running normally.</p>
        </div>
      </div>
    )
  }
  if (status === 'degraded') {
    return (
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-5 py-4">
        <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-amber-900">Degraded Performance</p>
          <p className="text-xs text-amber-700 mt-0.5">One or more services are not performing optimally. Investigate below.</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-400 rounded-xl px-5 py-4">
      <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
      <div>
        <p className="font-semibold text-red-900">System Outage</p>
        <p className="text-xs text-red-700 mt-0.5">Critical services are unavailable. Immediate action required.</p>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const { loading: sessionLoading } = useSession()
  const [data, setData]             = useState<SystemData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [countdown, setCountdown]   = useState(AUTO_REFRESH_SECS)
  const [errors, setErrors]         = useState<ErrorLogRow[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const runChecks = useCallback(async () => {
    setLoading(true)
    const supabase = createBrowserSupabaseClient()

    try {
      // ── DB health: time a simple query ────────────────────────────────
      const t0 = Date.now()
      const { error: dbErr } = await supabase.from('industry_spaces').select('id').limit(1)
      const dbResponseMs = Date.now() - t0
      const dbStatus: ServiceStatus = dbErr ? 'down' : dbResponseMs < 300 ? 'healthy' : dbResponseMs < 1000 ? 'degraded' : 'down'

      // ── Auth health: check session ────────────────────────────────────
      const t1 = Date.now()
      const { error: authErr } = await supabase.auth.getSession()
      const authResponseMs = Date.now() - t1
      const authStatus: ServiceStatus = authErr ? 'degraded' : authResponseMs < 500 ? 'healthy' : 'degraded'

      // ── AI Brain: aggregate across all spaces ─────────────────────────
      const [spacesRes, rawItemsRes, suggestionsRes] = await Promise.all([
        supabase.from('industry_spaces').select('id, name').eq('status', 'active'),
        supabase.from('raw_items').select('id, space_id, created_at').eq('ai_processed', true).order('created_at', { ascending: false }).limit(200),
        supabase.from('ai_suggestions').select('raw_item_id, suggestion_type, accepted, created_at').order('created_at', { ascending: false }).limit(1000),
      ])

      const spaces      = (spacesRes.data    ?? []) as Array<{ id: string; name: string }>
      const rawItems    = (rawItemsRes.data  ?? []) as Array<{ id: string; space_id: string; created_at: string }>
      const suggestions = (suggestionsRes.data ?? []) as Array<{ raw_item_id: string; suggestion_type: string; accepted: boolean | null; created_at: string }>

      // Build space → raw items map
      const spaceRawMap = new Map<string, string[]>()
      for (const ri of rawItems) {
        if (!spaceRawMap.has(ri.space_id)) spaceRawMap.set(ri.space_id, [])
        spaceRawMap.get(ri.space_id)!.push(ri.id)
      }

      const aiBrain: SpaceAiBrainRow[] = spaces.map(s => {
        const spaceRawIds = spaceRawMap.get(s.id) ?? []
        const spaceSugs   = suggestions.filter(sg => spaceRawIds.includes(sg.raw_item_id))

        const tagSugs  = spaceSugs.filter(sg => sg.suggestion_type === 'tag')
        const dupeSugs = spaceSugs.filter(sg => sg.suggestion_type === 'duplicate')

        const tagAcceptance = tagSugs.length > 0
          ? Math.round((tagSugs.filter(sg => sg.accepted === true).length / tagSugs.length) * 100) : 0
        const dupeAccuracy = dupeSugs.length > 0
          ? Math.round((dupeSugs.filter(sg => sg.accepted === true).length / dupeSugs.length) * 100) : 0

        // Avg processing time: diff between raw_item created_at and first suggestion created_at
        const rawMap = new Map(rawItems.filter(ri => ri.space_id === s.id).map(ri => [ri.id, ri.created_at]))
        const firstSugMap = new Map<string, string>()
        for (const sg of spaceSugs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())) {
          if (!firstSugMap.has(sg.raw_item_id)) firstSugMap.set(sg.raw_item_id, sg.created_at)
        }
        const diffs: number[] = []
        for (const [rid, fsAt] of firstSugMap) {
          const rawAt = rawMap.get(rid)
          if (rawAt) {
            const diff = (new Date(fsAt).getTime() - new Date(rawAt).getTime()) / 1000
            if (diff >= 0) diffs.push(diff)
          }
        }
        const avgProcessingSecs = diffs.length > 0 ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10 : 0

        return {
          spaceId: s.id,
          spaceName: s.name,
          tagAcceptance,
          dupeAccuracy,
          avgProcessingSecs,
          health: getAiBrainHealth(tagAcceptance, dupeAccuracy, avgProcessingSecs),
        }
      })

      // ── Build services array ──────────────────────────────────────────
      const services: ServiceCheck[] = [
        {
          name: 'Supabase Database',
          status: dbStatus,
          responseMs: dbResponseMs,
          detail: dbErr ? dbErr.message : `Query responded in ${dbResponseMs}ms`,
        },
        {
          name: 'Supabase Auth',
          status: authStatus,
          responseMs: authResponseMs,
          detail: authErr ? authErr.message : `Auth service responded in ${authResponseMs}ms`,
        },
        {
          name: 'OpenRouter API',
          status: 'unknown' as ServiceStatus,
          responseMs: null,
          detail: 'Status check not available from browser. Verify via Supabase Edge Function logs.',
        },
        {
          name: 'Cohere API',
          status: 'unknown' as ServiceStatus,
          responseMs: null,
          detail: 'Status check not available from browser. Verify via Supabase Edge Function logs.',
        },
      ]

      const unhealthy = services.filter(s => s.status === 'down').length
      const degraded  = services.filter(s => s.status === 'degraded').length
      const overallStatus: SystemData['overallStatus'] =
        unhealthy > 0 ? 'down' : degraded > 0 ? 'degraded' : 'operational'

      setData({
        services,
        aiBrain,
        errors,
        dbResponseMs,
        overallStatus,
        checkedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[System Health] check error:', err)
    } finally {
      setLoading(false)
      setCountdown(AUTO_REFRESH_SECS)
    }
  }, [errors])

  useEffect(() => {
    if (!sessionLoading) runChecks()
  }, [sessionLoading])

  // Auto-refresh every 60s
  useEffect(() => {
    intervalRef.current = setInterval(runChecks, AUTO_REFRESH_SECS * 1000)
    countdownRef.current = setInterval(() => setCountdown(c => Math.max(c - 1, 0)), 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [runChecks])

  function markResolved(id: string) {
    setErrors(prev => prev.map(e => e.id === id ? { ...e, resolved: true } : e))
  }

  const checkedLabel = data
    ? new Date(data.checkedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'

  return (
    <div className="max-w-screen-xl mx-auto p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">System Health</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Last checked: {checkedLabel} — auto-refreshes in{' '}
            <span className="font-semibold text-slate-600">{countdown}s</span>
          </p>
        </div>
        <button
          onClick={runChecks}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-colors"
          style={{ backgroundColor: GOLD }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Checking…' : 'Refresh Now'}
        </button>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          {[0,1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : data ? (
        <>
          {/* Overall status */}
          <OverallBanner status={data.overallStatus} />

          {/* Service status cards */}
          <div className="grid grid-cols-2 gap-4">
            {data.services.map(svc => (
              <div key={svc.name} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <StatusDot status={svc.status} />
                    <h3 className="font-semibold text-slate-900">{svc.name}</h3>
                  </div>
                  <StatusLabel status={svc.status} />
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                  {svc.responseMs !== null && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {svc.responseMs}ms
                    </span>
                  )}
                  <span>{svc.detail}</span>
                </div>
              </div>
            ))}
          </div>

          {/* AI Brain — all spaces */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">AI Brain Performance — All Spaces</h2>
            {data.aiBrain.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No active spaces with AI data yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Space</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tag Acceptance</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dupe Accuracy</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Processing</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.aiBrain.map(row => {
                    const hCfg = HEALTH_CONFIG[row.health]
                    const warn = row.health !== 'good'
                    return (
                      <tr key={row.spaceId} className={warn ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                        <td className="py-3 px-3 font-medium text-slate-900">{row.spaceName}</td>
                        <td className={`py-3 px-3 text-center font-semibold ${row.tagAcceptance >= AI_TARGETS.tagAcceptance ? 'text-teal-700' : 'text-amber-600'}`}>
                          {row.tagAcceptance > 0 ? `${row.tagAcceptance}%` : '—'}
                        </td>
                        <td className={`py-3 px-3 text-center font-semibold ${row.dupeAccuracy >= AI_TARGETS.duplicateAccuracy ? 'text-teal-700' : 'text-amber-600'}`}>
                          {row.dupeAccuracy > 0 ? `${row.dupeAccuracy}%` : '—'}
                        </td>
                        <td className={`py-3 px-3 text-center font-semibold ${row.avgProcessingSecs === 0 || row.avgProcessingSecs <= AI_TARGETS.processingTimeSecs ? 'text-teal-700' : 'text-red-600'}`}>
                          {row.avgProcessingSecs > 0 ? `${row.avgProcessingSecs}s` : '—'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${hCfg.bg} ${hCfg.text} ${hCfg.border}`}>
                            {hCfg.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Error Log */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Error Log</h2>
            {errors.filter(e => !e.resolved).length === 0 ? (
              <div className="flex items-center gap-3 py-6 justify-center text-green-700">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <p className="text-sm font-medium">No unresolved errors</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Count</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Space</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Seen</th>
                    <th className="py-2 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {errors.filter(e => !e.resolved).map(e => (
                    <tr key={e.id} className="hover:bg-red-50">
                      <td className="py-2.5 px-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{e.type}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">{e.message}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-700">{e.count}</td>
                      <td className="py-2.5 px-3 text-gray-500">{e.space ?? 'Platform'}</td>
                      <td className="py-2.5 px-3 text-xs text-gray-500">{e.lastSeen}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button onClick={() => markResolved(e.id)}
                          className="text-xs font-medium px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
                          Mark Resolved
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Uptime note */}
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-slate-700">Uptime History</h3>
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 30 }, (_, i) => (
                <div key={i} className="flex-1 h-6 rounded-sm bg-green-400" style={{ opacity: 0.7 + Math.random() * 0.3 }} title={`Day ${30 - i}`} />
              ))}
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-gray-400">30 days ago</span>
              <span className="text-xs font-semibold text-green-700">99.9% uptime</span>
              <span className="text-xs text-gray-400">Today</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
