'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  AlertCircle, AlertTriangle, GitMerge, Sparkles,
  ChevronRight, FileText, Shield, Play, Search, ChevronDown, ChevronUp, Eye,
} from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { EditorNav } from '@/components/layout/EditorNav'
import { timeAgo, SOURCE_TYPE_CONFIG, SEVERITY_CONFIG, type RawItemWithContributor } from '@/lib/editor'
import type { AiSuggestion, Tag } from '@/types'

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'
type SortOrder = 'newest' | 'oldest'

interface InboxItem extends RawItemWithContributor {
  suggestedSeverity: string
  hasDuplicateWarning: boolean
  hasThreadMatch: boolean
  opened_by: string | null
  opened_at: string | null
  opener_name: string | null
}

function SourceIcon({ type, size = 14, className = '' }: { type: string; size?: number; className?: string }) {
  const props = { size, className }
  switch (type) {
    case 'blog': return <FileText {...props} />
    case 'official': return <Shield {...props} />
    case 'youtube': return <Play {...props} />
    case 'ai_tool': return <Sparkles {...props} />
    default: return <FileText {...props} />
  }
}

export default function EditorInboxPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [processingItems, setProcessingItems] = useState<RawItemWithContributor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [searchQuery, setSearchQuery] = useState('')
  const [processingExpanded, setProcessingExpanded] = useState(false)

  useEffect(() => {
    if (sessionLoading || !currentUser) return
    loadInbox()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, currentUser])

  async function loadInbox() {
    try {
      setLoading(true)
      setLoadError(null)
      const supabase = createBrowserSupabaseClient()
      const spaceId = currentUser!.space_id

      if (!spaceId) {
        setLoadError('Your account has no space assigned.')
        return
      }

      // ── Fetch inbox: both pending AND in_review (ai_processed=true) ────────
      // Items only leave inbox when published (processed) or rejected.
      const { data: rawInbox, error: inboxError } = await supabase
        .from('raw_items')
        .select('*, users!submitted_by(name)')
        .eq('space_id', spaceId)
        .in('status', ['pending', 'in_review'])
        .eq('ai_processed', true)
        .order('created_at', { ascending: false })

      if (inboxError) throw inboxError

      // ── Fetch processing items (ai_processed=false) ────────────────────────
      const { data: rawProcessing, error: processingError } = await supabase
        .from('raw_items')
        .select('*, users!submitted_by(name)')
        .eq('space_id', spaceId)
        .eq('status', 'pending')
        .eq('ai_processed', false)
        .order('created_at', { ascending: false })

      if (processingError) throw processingError

      // ── Fetch opener names for in_review items ─────────────────────────────
      const openerIds = Array.from(new Set(
        (rawInbox ?? [])
          .filter((r: { status: string; opened_by: string | null }) => r.status === 'in_review' && r.opened_by)
          .map((r: { opened_by: string }) => r.opened_by)
      ))

      let openerNamesMap: Record<string, string> = {}
      if (openerIds.length > 0) {
        const { data: openerUsers } = await supabase
          .from('users')
          .select('id, name')
          .in('id', openerIds)
        openerNamesMap = ((openerUsers ?? []) as { id: string; name: string }[])
          .reduce<Record<string, string>>((acc, u) => { acc[u.id] = u.name; return acc }, {})
      }

      // ── Fetch AI suggestions for inbox items ───────────────────────────────
      const inboxIds = (rawInbox ?? []).map((r: { id: string }) => r.id)

      let suggestionsMap: Record<string, AiSuggestion[]> = {}
      let tagsMap: Record<string, Tag> = {}

      if (inboxIds.length > 0) {
        const { data: suggestions } = await supabase
          .from('ai_suggestions')
          .select('*')
          .in('raw_item_id', inboxIds)

        if (suggestions && suggestions.length > 0) {
          suggestionsMap = (suggestions as AiSuggestion[]).reduce<Record<string, AiSuggestion[]>>(
            (acc, s) => {
              if (!acc[s.raw_item_id]) acc[s.raw_item_id] = []
              acc[s.raw_item_id].push(s)
              return acc
            },
            {}
          )

          const tagSuggestionIds = (suggestions as AiSuggestion[])
            .filter((s) => s.suggestion_type === 'tag')
            .map((s) => s.suggested_value)

          if (tagSuggestionIds.length > 0) {
            const { data: tags } = await supabase
              .from('tags')
              .select('*')
              .in('id', tagSuggestionIds)
              .eq('type', 'severity')

            tagsMap = ((tags as Tag[]) ?? []).reduce<Record<string, Tag>>(
              (acc, t) => { acc[t.id] = t; return acc },
              {}
            )
          }
        }
      }

      // ── Build InboxItem list ───────────────────────────────────────────────
      type RawRow = {
        id: string
        space_id: string
        submitted_by: string
        source_id: string | null
        source_url: string | null
        raw_text: string
        notes: string | null
        status: 'pending' | 'in_review' | 'processed' | 'rejected'
        ai_processed: boolean
        created_at: string
        updated_at: string
        source_type?: string | null
        opened_by: string | null
        opened_at: string | null
        users: { name: string } | null
      }

      const built: InboxItem[] = ((rawInbox ?? []) as RawRow[]).map((item) => {
        const itemSuggestions = suggestionsMap[item.id] ?? []
        const hasDuplicateWarning = itemSuggestions.some((s) => s.suggestion_type === 'duplicate')
        const hasThreadMatch = itemSuggestions.some((s) => s.suggestion_type === 'thread')

        const tagSuggestions = itemSuggestions
          .filter((s) => s.suggestion_type === 'tag' && tagsMap[s.suggested_value])
          .sort((a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0))

        const severityTag = tagSuggestions.find((s) => tagsMap[s.suggested_value])
        const suggestedSeverity = severityTag
          ? tagsMap[severityTag.suggested_value]?.name?.toLowerCase() ?? 'medium'
          : 'medium'

        const opener_name = item.opened_by ? (openerNamesMap[item.opened_by] ?? null) : null

        return {
          ...item,
          contributor_name: item.users?.name ?? 'Unknown',
          suggestedSeverity,
          hasDuplicateWarning,
          hasThreadMatch,
          opened_by: item.opened_by,
          opened_at: item.opened_at,
          opener_name,
        }
      })

      const builtProcessing: RawItemWithContributor[] = ((rawProcessing ?? []) as RawRow[]).map((item) => ({
        ...item,
        contributor_name: item.users?.name ?? 'Unknown',
      }))

      setInboxItems(built)
      setProcessingItems(builtProcessing)
    } catch (err) {
      console.error('[EditorInbox] error:', err)
      setLoadError('Failed to load inbox. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  // ── Filtered + sorted items ────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let items = inboxItems

    if (severityFilter !== 'all') {
      items = items.filter((i) => i.suggestedSeverity === severityFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (i) =>
          i.raw_text.toLowerCase().includes(q) ||
          (i.notes?.toLowerCase().includes(q) ?? false)
      )
    }

    return [...items].sort((a, b) => {
      if (sortOrder === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
  }, [inboxItems, severityFilter, searchQuery, sortOrder])

  const pendingCount = inboxItems.filter((i) => i.status === 'pending').length
  const inReviewCount = inboxItems.filter((i) => i.status === 'in_review').length

  // ─── Loading skeleton ──────────────────────────────────────────────────────
  if (sessionLoading || (loading && currentUser)) {
    return (
      <>
        <EditorNav />
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="h-7 w-40 bg-gray-200 rounded animate-pulse mb-6" />
          <div className="flex gap-3 mb-4">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-8 w-20 bg-gray-100 rounded-full animate-pulse" />)}
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        </div>
      </>
    )
  }

  if (!currentUser) return null

  if (loadError) {
    return (
      <>
        <EditorNav />
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
          <p className="text-slate-800 font-semibold mb-2">Failed to load inbox</p>
          <p className="text-sm text-gray-500 mb-6">{loadError}</p>
          <button
            onClick={loadInbox}
            className="text-sm border border-gray-300 rounded-lg px-5 py-2 hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      </>
    )
  }

  const SEVERITY_TABS: { key: SeverityFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'critical', label: 'Critical' },
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low', label: 'Low' },
  ]

  return (
    <>
      <EditorNav />
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-bold text-slate-900">Inbox</h1>
            {pendingCount > 0 && (
              <span className="text-sm text-gray-400">{pendingCount} unread</span>
            )}
            {inReviewCount > 0 && (
              <span className="text-sm text-gray-400">· {inReviewCount} opened</span>
            )}
          </div>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative mb-4 mt-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search submissions..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {/* Severity filter tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {SEVERITY_TABS.map(({ key, label }) => {
            const isActive = severityFilter === key
            const cfg = key !== 'all' ? SEVERITY_CONFIG[key] : null
            return (
              <button
                key={key}
                onClick={() => setSeverityFilter(key)}
                className={`flex-shrink-0 text-sm font-medium px-3.5 py-1.5 rounded-full transition-colors ${
                  isActive
                    ? cfg
                      ? `${cfg.bg} ${cfg.text} border ${cfg.border}`
                      : 'bg-slate-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Inbox list */}
        {filteredItems.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center mb-6">
            <Sparkles size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium">
              {searchQuery || severityFilter !== 'all'
                ? 'No items match your filters.'
                : 'Your inbox is empty. All submissions have been reviewed.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {filteredItems.map((item) => {
              const isRead = item.status === 'in_review'
              const isOpenedByMe = item.opened_by === currentUser.id
              const srcType = item.source_type ?? 'other'
              const srcConf = SOURCE_TYPE_CONFIG[srcType] ?? SOURCE_TYPE_CONFIG.other
              const sevCfg = SEVERITY_CONFIG[item.suggestedSeverity] ?? SEVERITY_CONFIG.medium
              const preview = item.raw_text.slice(0, 80).trimEnd()
              const notesPreview = item.notes ? item.notes.slice(0, 60).trimEnd() : null

              return (
                <Link
                  key={item.id}
                  href={`/editor/draft/${item.id}`}
                  className={`flex items-start gap-3 border rounded-xl px-4 py-3 transition-colors group ${
                    isRead
                      ? 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {/* Source icon */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${srcConf.bgColor}`}>
                    <SourceIcon type={srcType} size={14} className={srcConf.color} />
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    {/* Headline */}
                    <p className={`text-sm truncate ${isRead ? 'font-normal text-gray-600' : 'font-semibold text-slate-800'}`}>
                      {preview}{item.raw_text.length > 80 ? '…' : ''}
                    </p>

                    {/* Notes preview */}
                    {notesPreview && (
                      <p className="text-xs text-gray-400 italic mt-0.5 truncate">
                        {notesPreview}{(item.notes?.length ?? 0) > 60 ? '…' : ''}
                      </p>
                    )}

                    {/* Contributor + time */}
                    <p className="text-xs text-gray-400 mt-1">
                      Submitted by <span className="font-medium text-gray-500">{item.contributor_name}</span>
                      {' · '}{timeAgo(item.created_at)}
                    </p>

                    {/* Opened indicator for in_review items */}
                    {isRead && item.opener_name && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Eye size={11} className="text-gray-400" />
                        <span className="text-xs text-gray-400">
                          {isOpenedByMe
                            ? `Opened by you${item.opened_at ? ` · started ${timeAgo(item.opened_at)}` : ''}`
                            : `Being edited by ${item.opener_name}${item.opened_at ? ` · started ${timeAgo(item.opened_at)}` : ''}`
                          }
                        </span>
                      </div>
                    )}
                    {isRead && !item.opener_name && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Eye size={11} className="text-gray-400" />
                        <span className="text-xs text-gray-400">Previously opened</span>
                      </div>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isRead
                        ? 'bg-gray-200 text-gray-500'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {isRead ? 'Opened' : 'AI READY'}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sevCfg.bg} ${sevCfg.text}`}>
                      {sevCfg.label}
                    </span>
                    {item.hasDuplicateWarning && (
                      <span title="Possible duplicate detected">
                        <AlertTriangle size={15} className="text-red-500" />
                      </span>
                    )}
                    {item.hasThreadMatch && (
                      <span title="Thread match found">
                        <GitMerge size={15} className="text-teal-500" />
                      </span>
                    )}
                  </div>

                  <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0 mt-1" />
                </Link>
              )
            })}
          </div>
        )}

        {/* Processing section (collapsible) */}
        {processingItems.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setProcessingExpanded(!processingExpanded)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">AI Processing Queue</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  {processingItems.length}
                </span>
              </div>
              {processingExpanded ? (
                <ChevronUp size={16} className="text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-400" />
              )}
            </button>

            {processingExpanded && (
              <div className="border-t border-gray-100">
                {processingItems.map((item) => {
                  const srcType = item.source_type ?? 'other'
                  const srcConf = SOURCE_TYPE_CONFIG[srcType] ?? SOURCE_TYPE_CONFIG.other
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 px-5 py-3 border-b border-gray-50 last:border-b-0"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${srcConf.bgColor}`}>
                        <SourceIcon type={srcType} size={13} className={srcConf.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 truncate">
                          {item.raw_text.slice(0, 80)}
                          {item.raw_text.length > 80 ? '…' : ''}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {item.contributor_name} · {timeAgo(item.created_at)}
                        </p>
                      </div>
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                        Processing
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </>
  )
}
