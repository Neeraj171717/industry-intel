'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertCircle, Sparkles, CheckCircle, XCircle, AlertTriangle,
  ExternalLink, X, Plus, ChevronDown, Loader2, RotateCcw,
} from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { EditorNav } from '@/components/layout/EditorNav'
import {
  timeAgo, SOURCE_TYPE_CONFIG, SEVERITY_CONFIG, CONTENT_TYPE_CONFIG,
  type RawItemWithContributor, type AiSuggestionWithDetails,
} from '@/lib/editor'
import type { Tag, EventThread, AiSuggestion } from '@/types'

// ─── Local storage key ──────────────────────────────────────────────────────
function draftKey(id: string) { return `draft_${id}` }

interface SavedDraft {
  headline: string
  summary: string
  body: string
  contentType: string
  severity: string
  locality: string
  impact: string
  threadId: string | null
  tagIds: string[]
}

// ─── Publish Modal ────────────────────────────────────────────────────────────
function PublishModal({
  headline, summary, severity, threadTitle, appliedTags, hasDuplicateWarning,
  onConfirm, onCancel, saving,
}: {
  headline: string
  summary: string
  severity: string
  threadTitle: string | null
  appliedTags: Tag[]
  hasDuplicateWarning: boolean
  onConfirm: () => void
  onCancel: () => void
  saving: boolean
}) {
  const sevCfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.medium
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Confirm Publication</h2>
        <p className="text-sm text-gray-500 mb-4">Review before publishing</p>

        {hasDuplicateWarning && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700">AI flagged a possible duplicate. Review before publishing.</p>
          </div>
        )}

        <div className="space-y-3 mb-5">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Headline</p>
            <p className="text-sm font-semibold text-slate-800">{headline}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Summary</p>
            <p className="text-sm text-gray-700 line-clamp-3">{summary}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sevCfg.bg} ${sevCfg.text}`}>
              {sevCfg.label}
            </span>
            {threadTitle && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-100 text-teal-700">
                {threadTitle}
              </span>
            )}
          </div>
          {appliedTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {appliedTags.map((t) => (
                <span key={t.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 bg-slate-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {saving ? 'Publishing…' : 'Publish Now'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Rejection Modal ──────────────────────────────────────────────────────────
const REJECTION_REASONS = [
  'Duplicate content',
  'Low quality / insufficient detail',
  'Off-topic for this space',
  'Unverifiable source',
  'Outdated information',
  'Violates content policy',
  'Other',
]

function RejectionModal({
  onConfirm, onCancel, saving,
}: {
  onConfirm: (reason: string, note: string) => void
  onCancel: () => void
  saving: boolean
}) {
  const [reason, setReason] = useState(REJECTION_REASONS[0])
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Reject Submission</h2>
        <p className="text-sm text-gray-500 mb-4">The contributor will not be notified directly.</p>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Reason
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {REJECTION_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Internal Note <span className="font-normal text-gray-400 normal-case">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add context for your team…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason, note)}
            disabled={saving}
            className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Rejecting…' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Thread Creation Modal ─────────────────────────────────────────────────────
function CreateThreadModal({
  onConfirm, onCancel, saving,
}: {
  onConfirm: (title: string, description: string) => void
  onCancel: () => void
  saving: boolean
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Create New Thread</h2>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Thread Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. EU AI Act Developments"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Description <span className="font-normal text-gray-400 normal-case">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 border-2 border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(title, description)}
            disabled={saving || title.trim().length < 2}
            className="flex-1 bg-slate-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Thread'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DraftBuilderPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const params = useParams()
  const router = useRouter()
  const rawItemId = params.id as string

  // ── Raw item & related data ─────────────────────────────────────────────────
  const [rawItem, setRawItem] = useState<RawItemWithContributor | null>(null)
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionWithDetails[]>([])
  const [spaceTags, setSpaceTags] = useState<Tag[]>([])
  const [spaceThreads, setSpaceThreads] = useState<EventThread[]>([])
  const [duplicateTitles, setDuplicateTitles] = useState<Record<string, string>>({})

  // ── Loading / error states ──────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // No hard lock — concurrent editing is allowed with courtesy indicators in inbox

  // ── Draft form state ────────────────────────────────────────────────────────
  const [draftHeadline, setDraftHeadline] = useState('')
  const [draftSummary, setDraftSummary] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [selectedContentType, setSelectedContentType] = useState('')
  const [selectedSeverity, setSelectedSeverity] = useState('')
  const [selectedLocality, setSelectedLocality] = useState('')
  const [selectedImpact, setSelectedImpact] = useState('')
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [appliedTags, setAppliedTags] = useState<Tag[]>([])

  // ── AI suggestion state ─────────────────────────────────────────────────────
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set())
  const [rejectedSuggestions, setRejectedSuggestions] = useState<Set<string>>(new Set())

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showCreateThreadModal, setShowCreateThreadModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [publishAttempted, setPublishAttempted] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [showRejectedTags, setShowRejectedTags] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // ── Auto-draft state ──────────────────────────────────────────────────────
  const [draftPreFilled, setDraftPreFilled] = useState(false)
  const [bodyGenerating, setBodyGenerating] = useState(false)
  const [bodyAiGenerated, setBodyAiGenerated] = useState(false)
  const [bodyAiFailed, setBodyAiFailed] = useState(false)
  const generateCalled = useRef(false)

  // ── Data loading ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionLoading || !currentUser || !rawItemId) return
    loadDraftData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, currentUser, rawItemId])

  // ── Save to localStorage on every field change ───────────────────────────────
  // Runs immediately whenever any draft field changes — no timer, no data loss on tab switch.
  // Guard: skip while loading or while AI is still generating body to avoid saving empty body.
  useEffect(() => {
    if (!rawItemId || loading || bodyGenerating) return
    const draft: SavedDraft = {
      headline: draftHeadline,
      summary: draftSummary,
      body: draftBody,
      contentType: selectedContentType,
      severity: selectedSeverity,
      locality: selectedLocality,
      impact: selectedImpact,
      threadId: selectedThreadId,
      tagIds: appliedTags.map((t) => t.id),
    }
    localStorage.setItem(draftKey(rawItemId), JSON.stringify(draft))
  }, [rawItemId, loading, bodyGenerating, draftHeadline, draftSummary, draftBody, selectedContentType, selectedSeverity, selectedLocality, selectedImpact, selectedThreadId, appliedTags])

  // ── Clear draft from localStorage ────────────────────────────────────────────
  function clearDraft() {
    localStorage.removeItem(draftKey(rawItemId))
    setDraftHeadline('')
    setDraftSummary('')
    setDraftBody('')
    setSelectedContentType('')
    setSelectedSeverity('')
    setSelectedLocality('')
    setSelectedImpact('')
    setSelectedThreadId(null)
    setAppliedTags([])
    setValidationErrors([])
    setDraftPreFilled(false)
    setBodyAiGenerated(false)
    setBodyAiFailed(false)
    generateCalled.current = false
  }

  // ── Reset auto-draft (clears AI-generated content only) ─────────────────────
  function resetAutoDraft() {
    setDraftHeadline('')
    setDraftSummary('')
    setDraftBody('')
    setSelectedContentType('')
    setSelectedSeverity('')
    setSelectedLocality('')
    setSelectedImpact('')
    setDraftPreFilled(false)
    setBodyAiGenerated(false)
    setBodyAiFailed(false)
    generateCalled.current = false
  }

  // ── Phase 2: Generate article body via OpenRouter ──────────────────────────
  const generateArticleBody = useCallback(async (rawText: string) => {
    // Prevent double-call in React strict mode
    if (generateCalled.current) {
      console.log('[AutoDraft] Skipping — already called')
      return
    }
    generateCalled.current = true
    console.log('[AutoDraft] Starting article body generation...')

    setBodyGenerating(true)
    setBodyAiFailed(false)

    try {
      const res = await fetch('/api/generate-article-body', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, spaceId: currentUser?.space_id }),
      })

      console.log('[AutoDraft] API response status:', res.status)

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const data = await res.json()
      console.log('[AutoDraft] API response data:', data)
      console.log('[AutoDraft] Generated body text:', data.body)
      console.log('[AutoDraft] Body length:', data.body?.length ?? 0)

      if (data.body) {
        console.log('[AutoDraft] Setting draftBody state...')
        setDraftBody(data.body)
        setBodyAiGenerated(true)
        console.log('[AutoDraft] draftBody state updated successfully')
      } else {
        console.log('[AutoDraft] No body in response — marking as failed')
        setBodyAiFailed(true)
      }
    } catch (err) {
      console.error('[AutoDraft] Error:', err)
      setBodyAiFailed(true)
    } finally {
      setBodyGenerating(false)
    }
  }, [])

  // ── Manual save (button) ──────────────────────────────────────────────────────
  function saveDraftToLocalStorage() {
    if (!rawItemId) return
    const draft: SavedDraft = {
      headline: draftHeadline,
      summary: draftSummary,
      body: draftBody,
      contentType: selectedContentType,
      severity: selectedSeverity,
      locality: selectedLocality,
      impact: selectedImpact,
      threadId: selectedThreadId,
      tagIds: appliedTags.map((t) => t.id),
    }
    localStorage.setItem(draftKey(rawItemId), JSON.stringify(draft))
  }

  async function loadDraftData() {
    try {
      setLoading(true)
      setLoadError(null)
      const supabase = createBrowserSupabaseClient()
      const spaceId = currentUser!.space_id

      if (!spaceId) {
        setLoadError('No space assigned to your account.')
        return
      }

      // ── Fetch raw item with contributor name ────────────────────────────
      const { data: itemData, error: itemError } = await supabase
        .from('raw_items')
        .select('*, users!submitted_by(name)')
        .eq('id', rawItemId)
        .eq('space_id', spaceId)
        .single()

      if (itemError || !itemData) {
        setLoadError('Item not found or does not belong to your space.')
        return
      }

      const item = {
        ...itemData,
        contributor_name: (itemData.users as { name: string } | null)?.name ?? 'Unknown',
      } as RawItemWithContributor

      // ── Mark as in_review — record who opened it and when ──────────────
      // Only set opened_by/opened_at if not already set (first editor to open wins).
      // Status stays in_review permanently until published or rejected — no timeout.
      const now = new Date().toISOString()
      const updatePayload: Record<string, unknown> = {
        status: 'in_review',
        updated_at: now,
      }
      if (!item.opened_by) {
        updatePayload.opened_by = currentUser!.id
        updatePayload.opened_at = now
      }
      await supabase
        .from('raw_items')
        .update(updatePayload)
        .eq('id', rawItemId)

      setRawItem(item)

      // ── Parallel fetch: suggestions, tags, threads ──────────────────────
      const [
        { data: suggestions },
        { data: tags },
        { data: threads },
      ] = await Promise.all([
        supabase
          .from('ai_suggestions')
          .select('*')
          .eq('raw_item_id', rawItemId),
        supabase.from('tags').select('*').eq('space_id', spaceId).eq('status', 'active'),
        supabase.from('event_threads').select('*').eq('space_id', spaceId).eq('status', 'active').order('created_at', { ascending: false }),
      ])

      const tagsArr = (tags as Tag[]) ?? []
      const threadsArr = (threads as EventThread[]) ?? []
      const suggestionsArr = (suggestions as AiSuggestion[]) ?? []

      setSpaceTags(tagsArr)
      setSpaceThreads(threadsArr)

      // ── Enrich suggestions with tag/thread details ──────────────────────
      const tagsById = tagsArr.reduce<Record<string, Tag>>((acc, t) => { acc[t.id] = t; return acc }, {})
      const threadsById = threadsArr.reduce<Record<string, EventThread>>((acc, t) => { acc[t.id] = t; return acc }, {})

      const enriched: AiSuggestionWithDetails[] = suggestionsArr.map((s) => ({
        ...s,
        tag: s.suggestion_type === 'tag' ? tagsById[s.suggested_value] : undefined,
        thread: s.suggestion_type === 'thread' ? threadsById[s.suggested_value] : undefined,
      }))

      setAiSuggestions(enriched)

      // ── Restore accepted/rejected state from DB (source of truth) ───────
      const dbAccepted = new Set(suggestionsArr.filter((s) => s.accepted === true).map((s) => s.id))
      const dbRejected = new Set(suggestionsArr.filter((s) => s.accepted === false).map((s) => s.id))
      setAcceptedSuggestions(dbAccepted)
      setRejectedSuggestions(dbRejected)

      // ── Fetch final_item titles for duplicate suggestions ───────────────
      const duplicateSuggestions = enriched.filter((s) => s.suggestion_type === 'duplicate')
      if (duplicateSuggestions.length > 0) {
        const finalItemIds = duplicateSuggestions.map((s) => s.suggested_value)
        const { data: finalItems } = await supabase
          .from('final_items')
          .select('id, title')
          .in('id', finalItemIds)

        if (finalItems) {
          const titleMap: Record<string, string> = {}
          ;(finalItems as { id: string; title: string }[]).forEach((fi) => {
            titleMap[fi.id] = fi.title
          })
          setDuplicateTitles(titleMap)
        }
      }

      // ── Pre-populate from localStorage if saved draft exists ────────────
      const savedRaw = localStorage.getItem(draftKey(rawItemId))
      const saved: SavedDraft | null = savedRaw ? (() => { try { return JSON.parse(savedRaw) } catch { return null } })() : null
      const hasSubstantialDraft = saved && (saved.headline || saved.summary || saved.body)

      if (hasSubstantialDraft) {
        setDraftHeadline(saved.headline ?? '')
        setDraftSummary(saved.summary ?? '')
        setDraftBody(saved.body ?? '')
        setSelectedContentType(saved.contentType ?? '')
        setSelectedSeverity(saved.severity ?? '')
        setSelectedLocality(saved.locality ?? '')
        setSelectedImpact(saved.impact ?? '')
        setSelectedThreadId(saved.threadId ?? null)
        // Re-attach tags: union of localStorage tags + DB-accepted AI tag suggestions
        const savedTagSet = new Set(saved.tagIds ?? [])
        const dbAcceptedTags = enriched
          .filter((s) => s.suggestion_type === 'tag' && s.tag && s.accepted === true)
          .map((s) => s.tag!)
        dbAcceptedTags.forEach((t) => savedTagSet.add(t.id))
        const restoredTags = tagsArr.filter((t) => savedTagSet.has(t.id))
        setAppliedTags(restoredTags)

        // If localStorage has headline/summary but no body, still generate AI body
        if (!saved.body) {
          setDraftPreFilled(true)
          generateArticleBody(item.raw_text)
        }
      } else {
        // No localStorage — check if DB already has accepted suggestions (returning editor)
        const dbAcceptedTagSuggestions = enriched.filter(
          (s) => s.suggestion_type === 'tag' && s.tag && s.accepted === true
        )
        const dbAcceptedThread = enriched.find(
          (s) => s.suggestion_type === 'thread' && s.accepted === true
        )

        if (dbAcceptedTagSuggestions.length > 0 || dbAcceptedThread) {
          // Restore from previous DB-persisted decisions
          if (dbAcceptedTagSuggestions.length > 0) {
            setAppliedTags(dbAcceptedTagSuggestions.map((s) => s.tag!))
          }
          if (dbAcceptedThread) {
            setSelectedThreadId(dbAcceptedThread.suggested_value)
          }
        } else {
          // First open — auto-populate from AI suggestions, write decisions to DB
          const severityTagSuggestion = enriched
            .filter((s) => s.suggestion_type === 'tag' && s.tag?.type === 'severity')
            .sort((a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0))[0]
          if (severityTagSuggestion?.tag) {
            setSelectedSeverity(severityTagSuggestion.tag.name.toLowerCase())
          }

          const threadSuggestion = enriched.find((s) => s.suggestion_type === 'thread' && s.thread)
          if (threadSuggestion) {
            setSelectedThreadId(threadSuggestion.suggested_value)
            setAcceptedSuggestions((prev) => new Set(Array.from(prev).concat(threadSuggestion.id)))
            supabase.from('ai_suggestions').update({ accepted: true }).eq('id', threadSuggestion.id)
          }

          const nonSeverityTagSuggestions = enriched.filter(
            (s) => s.suggestion_type === 'tag' && s.tag && s.tag.type !== 'severity'
          )
          const autoAccepted = nonSeverityTagSuggestions.filter((s) => (s.confidence_score ?? 0) >= 0.8)
          if (autoAccepted.length > 0) {
            setAppliedTags(autoAccepted.map((s) => s.tag!))
            setAcceptedSuggestions((prev) => new Set(Array.from(prev).concat(autoAccepted.map((s) => s.id))))
            await Promise.all(
              autoAccepted.map((s) =>
                supabase.from('ai_suggestions').update({ accepted: true }).eq('id', s.id)
              )
            )
          }

          // ── Phase 1: Pre-fill draft from raw_items data (zero AI cost) ────
          // Headline: title column → first line of raw_text → source_name
          const firstLine = item.raw_text.split('\n')[0]?.trim().slice(0, 100) ?? ''

          const prefillHeadline = item.title || firstLine || item.source_name || ''
          if (prefillHeadline) setDraftHeadline(prefillHeadline)

          // Summary: description with fallback to raw_text
          console.log('[AutoDraft] raw_items.description:', item.description ? `"${item.description.slice(0, 80)}..." (${item.description.length} chars)` : 'NULL/empty')
          const rawDescription = item.description?.trim()
          if (rawDescription) {
            let summary = rawDescription
            const headline = prefillHeadline.trim()
            if (headline && summary.toLowerCase().startsWith(headline.toLowerCase())) {
              summary = summary.slice(headline.length).replace(/^[\s\-–—:,.|]+/, '').trim()
            }
            if (summary) setDraftSummary(summary.slice(0, 400))
          } else {
            // Fallback: first 300 characters of raw_text
            const fallback = item.raw_text.trim().slice(0, 300)
            console.log('[AutoDraft] Using raw_text fallback for summary:', fallback.slice(0, 80) + '...')
            if (fallback) setDraftSummary(fallback)
          }

          // Defaults for metadata dropdowns
          if (!selectedContentType) setSelectedContentType('news_update')
          if (!severityTagSuggestion?.tag) setSelectedSeverity('medium')
          setSelectedLocality('global')
          setSelectedImpact('informational')

          setDraftPreFilled(true)

          // ── Phase 2: Generate AI article body in background ────────────────
          generateArticleBody(item.raw_text)
        }
      }
    } catch (err) {
      console.error('[DraftBuilder] error:', err)
      setLoadError('Failed to load draft. Please go back and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate(): string[] {
    const errors: string[] = []
    if (draftHeadline.trim().length < 5) errors.push('Headline must be at least 5 characters')
    if (draftSummary.trim().length < 20) errors.push('Summary must be at least 20 characters')
    if (draftBody.trim().length < 100) errors.push('Body must be at least 100 characters')
    if (!selectedContentType) errors.push('Select a content type')
    if (!selectedSeverity) errors.push('Select a severity level')
    if (!selectedLocality) errors.push('Select a locality')
    if (!selectedImpact) errors.push('Select an impact level')
    if (appliedTags.length < 1) errors.push('Apply at least one tag')
    return errors
  }

  function handlePublishClick() {
    setPublishAttempted(true)
    const errors = validate()
    setValidationErrors(errors)
    if (errors.length === 0) setShowPublishModal(true)
  }

  // ── Publish ──────────────────────────────────────────────────────────────────
  async function handlePublishConfirm() {
    setSaving(true)
    setPublishError(null)
    try {
      const res = await fetch('/api/editor/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_item_id: rawItemId,
          space_id: currentUser!.space_id,
          title: draftHeadline.trim(),
          summary: draftSummary.trim(),
          body: draftBody.trim(),
          content_type: selectedContentType,
          severity: selectedSeverity,
          locality: selectedLocality,
          impact: selectedImpact,
          thread_id: selectedThreadId,
          tag_ids: appliedTags.map((t) => t.id),
          accepted_suggestion_ids: Array.from(acceptedSuggestions),
          rejected_suggestion_ids: Array.from(rejectedSuggestions),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')

      localStorage.removeItem(draftKey(rawItemId))
      router.push('/editor/inbox')
    } catch (err) {
      console.error('[DraftBuilder] publish error:', err)
      setPublishError(err instanceof Error ? err.message : 'Publish failed')
      setShowPublishModal(false)
    } finally {
      setSaving(false)
    }
  }

  // ── Reject ───────────────────────────────────────────────────────────────────
  async function handleRejectConfirm(reason: string, note: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/editor/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_item_id: rawItemId,
          rejection_reason: reason,
          rejection_note: note || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Reject failed')

      localStorage.removeItem(draftKey(rawItemId))
      router.push('/editor/inbox')
    } catch (err) {
      console.error('[DraftBuilder] reject error:', err)
    } finally {
      setSaving(false)
      setShowRejectModal(false)
    }
  }

  // ── Create thread ─────────────────────────────────────────────────────────────
  async function handleCreateThread(title: string, description: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/editor/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: description || null }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Thread creation failed')

      const newThread = data.thread as EventThread
      setSpaceThreads((prev) => [newThread, ...prev])
      setSelectedThreadId(newThread.id)
      setShowCreateThreadModal(false)
    } catch (err) {
      console.error('[DraftBuilder] create thread error:', err)
    } finally {
      setSaving(false)
    }
  }

  // ── Tag management ────────────────────────────────────────────────────────────
  function addTag(tag: Tag) {
    if (appliedTags.find((t) => t.id === tag.id)) return
    setAppliedTags((prev) => [...prev, tag])
    setTagSearch('')
    setShowTagDropdown(false)
  }

  function removeTag(tagId: string) {
    setAppliedTags((prev) => prev.filter((t) => t.id !== tagId))
  }

  // Removing a chip from the centre panel resets the AI suggestion back to pending
  async function removeTagChip(tag: Tag) {
    removeTag(tag.id)
    const suggestion = aiSuggestions.find(
      (s) => s.suggestion_type === 'tag' && s.suggested_value === tag.id
    )
    if (suggestion) {
      setAcceptedSuggestions((prev) => {
        const next = new Set(prev)
        next.delete(suggestion.id)
        return next
      })
      const supabase = createBrowserSupabaseClient()
      await supabase.from('ai_suggestions').update({ accepted: null }).eq('id', suggestion.id)
    }
  }

  // Restoring a rejected suggestion brings it back to the active right panel
  async function restoreTagSuggestion(suggestion: AiSuggestionWithDetails) {
    setRejectedSuggestions((prev) => {
      const next = new Set(prev)
      next.delete(suggestion.id)
      return next
    })
    const supabase = createBrowserSupabaseClient()
    await supabase.from('ai_suggestions').update({ accepted: null }).eq('id', suggestion.id)
  }

  const availableTags = spaceTags.filter(
    (t) =>
      !appliedTags.find((at) => at.id === t.id) &&
      (tagSearch === '' || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
  )

  // ── AI suggestion accept/reject — writes to DB immediately ───────────────────
  async function acceptTagSuggestion(suggestion: AiSuggestionWithDetails) {
    if (!suggestion.tag) return
    addTag(suggestion.tag)
    setAcceptedSuggestions((prev) => new Set(Array.from(prev).concat(suggestion.id)))
    setRejectedSuggestions((prev) => {
      const next = new Set(prev)
      next.delete(suggestion.id)
      return next
    })
    const supabase = createBrowserSupabaseClient()
    await supabase.from('ai_suggestions').update({ accepted: true }).eq('id', suggestion.id)
  }

  async function rejectTagSuggestion(suggestion: AiSuggestionWithDetails) {
    setRejectedSuggestions((prev) => new Set(Array.from(prev).concat(suggestion.id)))
    setAcceptedSuggestions((prev) => {
      const next = new Set(prev)
      next.delete(suggestion.id)
      return next
    })
    // Remove from applied tags if it was previously accepted
    if (suggestion.tag) removeTag(suggestion.tag.id)
    const supabase = createBrowserSupabaseClient()
    await supabase.from('ai_suggestions').update({ accepted: false }).eq('id', suggestion.id)
  }

  async function acceptThreadSuggestion(suggestion: AiSuggestionWithDetails) {
    setSelectedThreadId(suggestion.suggested_value)
    setAcceptedSuggestions((prev) => new Set(Array.from(prev).concat(suggestion.id)))
    const supabase = createBrowserSupabaseClient()
    await supabase.from('ai_suggestions').update({ accepted: true }).eq('id', suggestion.id)
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const isPublishReady =
    draftHeadline.trim().length >= 5 &&
    draftSummary.trim().length >= 20 &&
    draftBody.trim().length >= 100 &&
    !!selectedContentType &&
    !!selectedSeverity &&
    !!selectedLocality &&
    !!selectedImpact &&
    appliedTags.length >= 1

  const hasDuplicateWarning = aiSuggestions.some((s) => s.suggestion_type === 'duplicate')
  const selectedThread = spaceThreads.find((t) => t.id === selectedThreadId) ?? null
  const duplicateSuggestions = aiSuggestions.filter((s) => s.suggestion_type === 'duplicate')
  const relatedSuggestions = aiSuggestions.filter((s) => s.suggestion_type === 'related')
  const tagSuggestions = aiSuggestions.filter((s) => s.suggestion_type === 'tag')
  const rejectedTagSuggestions = tagSuggestions.filter((s) => rejectedSuggestions.has(s.id))
  const threadSuggestions = aiSuggestions.filter((s) => s.suggestion_type === 'thread')

  // ─── Loading skeleton ────────────────────────────────────────────────────────
  if (sessionLoading || (loading && currentUser)) {
    return (
      <>
        <EditorNav />
        <div className="flex w-full h-[calc(100vh-56px)]">
          <div className="w-1/4 border-r bg-gray-50 p-4">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}
            </div>
          </div>
          <div className="w-1/2 border-r bg-white p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
            </div>
          </div>
          <div className="w-1/4 bg-white p-4">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />)}
            </div>
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
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <div className="text-center">
            <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
            <p className="text-slate-800 font-semibold mb-2">Failed to load draft</p>
            <p className="text-sm text-gray-500 mb-6">{loadError}</p>
            <button
              onClick={() => router.push('/editor/inbox')}
              className="text-sm border border-gray-300 rounded-lg px-5 py-2 hover:bg-gray-50"
            >
              Back to Inbox
            </button>
          </div>
        </div>
      </>
    )
  }


  if (!rawItem) return null

  const srcType = rawItem.source_type ?? 'other'
  const srcConf = SOURCE_TYPE_CONFIG[srcType] ?? SOURCE_TYPE_CONFIG.other

  return (
    <>
      <EditorNav />

      <div className="flex w-full h-[calc(100vh-56px)] overflow-hidden">

        {/* ── LEFT PANEL: Raw submission ──────────────────────────────────────── */}
        <div className="w-1/4 overflow-y-auto border-r border-gray-200 bg-gray-50">
          <div className="p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
              Raw Submission
            </p>

            {/* Contributor */}
            <div className="mb-3 flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${srcConf.bgColor}`}>
                <span className={`text-xs font-bold ${srcConf.color}`}>
                  {rawItem.contributor_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{rawItem.contributor_name}</p>
                <p className="text-xs text-gray-400">{timeAgo(rawItem.created_at)}</p>
              </div>
            </div>

            {/* Source type */}
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${srcConf.bgColor} ${srcConf.color}`}>
                {srcConf.label}
              </span>
              {rawItem.source_url && (
                <a
                  href={rawItem.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-0.5 truncate"
                >
                  View source <ExternalLink size={10} />
                </a>
              )}
            </div>

            {/* Notes */}
            {rawItem.notes && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold text-yellow-700 mb-1">Contributor Notes</p>
                <p className="text-xs text-yellow-800 leading-relaxed whitespace-pre-wrap">{rawItem.notes}</p>
              </div>
            )}

            {/* Raw text */}
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                {rawItem.raw_text}
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-right">
              {rawItem.raw_text.length} characters
            </p>
          </div>
        </div>

        {/* ── CENTRE PANEL: Draft form ────────────────────────────────────────── */}
        <div className="w-1/2 overflow-y-auto border-r border-gray-200 bg-white">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Write Article
              </p>
              {draftPreFilled && (
                <button
                  onClick={resetAutoDraft}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-slate-600 transition-colors"
                >
                  <RotateCcw size={11} />
                  Reset Draft
                </button>
              )}
            </div>

            {/* Pre-fill banner */}
            {draftPreFilled && (
              <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500">Draft pre-filled from submission data — please review and edit</p>
              </div>
            )}

            {/* Validation errors */}
            {publishAttempted && validationErrors.length > 0 && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-700 mb-1">Please fix before publishing:</p>
                <ul className="space-y-0.5">
                  {validationErrors.map((e) => (
                    <li key={e} className="text-xs text-red-600 flex items-center gap-1">
                      <XCircle size={10} /> {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {publishError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-700">{publishError}</p>
              </div>
            )}

            {/* Headline */}
            <div className="mb-4">
              <input
                type="text"
                value={draftHeadline}
                onChange={(e) => setDraftHeadline(e.target.value)}
                placeholder="Article headline…"
                maxLength={100}
                className="w-full text-xl font-bold text-slate-900 border-b-2 border-gray-200 focus:border-slate-900 outline-none pb-2 bg-transparent transition-colors placeholder:text-gray-300 placeholder:font-normal"
              />
              <p className={`text-xs mt-1 text-right ${draftHeadline.length > 90 ? 'text-amber-500' : 'text-gray-400'}`}>
                {draftHeadline.length} / 100
              </p>
            </div>

            {/* Summary */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Summary
              </label>
              <textarea
                value={draftSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
                placeholder="Brief summary for readers…"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-slate-300 leading-relaxed"
              />
              <p className={`text-xs mt-1 text-right ${draftSummary.length > 200 ? 'text-amber-500' : 'text-gray-400'}`}>
                {draftSummary.length} chars{draftSummary.length > 200 ? ' — consider shortening' : ''}
              </p>
            </div>

            {/* Body */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Article Body
                </label>
                {bodyAiGenerated && (
                  <span className="inline-flex items-center gap-1 bg-teal-50 border border-teal-200 text-teal-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                    <Sparkles size={9} />
                    AI Draft — please review and edit
                  </span>
                )}
              </div>
              {bodyGenerating ? (
                <div className="w-full border border-gray-200 rounded-lg px-3 py-8 flex flex-col items-center justify-center gap-2 bg-gray-50">
                  <Loader2 size={20} className="animate-spin text-teal-500" />
                  <p className="text-xs text-gray-500">AI is generating article body...</p>
                </div>
              ) : (
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Write the full article…"
                  rows={12}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-slate-300 leading-relaxed"
                />
              )}
              <div className="flex items-center justify-between mt-1">
                {bodyAiFailed && (
                  <p className="text-xs text-gray-400">AI draft unavailable — please write manually</p>
                )}
                <p className="text-xs text-gray-400 ml-auto text-right">
                  {draftBody.length} chars
                </p>
              </div>
            </div>

            {/* Metadata 2×2 grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Content Type
                </label>
                <div className="relative">
                  <select
                    value={selectedContentType}
                    onChange={(e) => setSelectedContentType(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="">Select type…</option>
                    {Object.entries(CONTENT_TYPE_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Severity
                </label>
                <div className="relative">
                  <select
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="">Select severity…</option>
                    {Object.entries(SEVERITY_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Locality
                </label>
                <div className="relative">
                  <select
                    value={selectedLocality}
                    onChange={(e) => setSelectedLocality(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="">Select locality…</option>
                    <option value="global">Global</option>
                    <option value="regional">Regional</option>
                    <option value="local">Local</option>
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Impact
                </label>
                <div className="relative">
                  <select
                    value={selectedImpact}
                    onChange={(e) => setSelectedImpact(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="">Select impact…</option>
                    <option value="strategic">Strategic</option>
                    <option value="tactical">Tactical</option>
                    <option value="informational">Informational</option>
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Event Thread */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Event Thread
              </label>
              <div className="relative">
                <select
                  value={selectedThreadId ?? ''}
                  onChange={(e) => {
                    if (e.target.value === '__create__') {
                      setShowCreateThreadModal(true)
                    } else {
                      setSelectedThreadId(e.target.value || null)
                    }
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">None (standalone)</option>
                  {spaceThreads.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                  <option value="__create__">＋ Create New Thread</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Tags */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Tags
              </label>

              {/* Applied tags */}
              {appliedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {appliedTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 bg-slate-900 text-white text-xs px-2.5 py-1 rounded-full"
                    >
                      {tag.name}
                      <button
                        onClick={() => removeTagChip(tag)}
                        className="hover:text-gray-300 ml-0.5"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add tag input */}
              <div className="relative">
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <Plus size={13} className="ml-2.5 text-gray-400 flex-shrink-0" />
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagSearch}
                    onChange={(e) => { setTagSearch(e.target.value); setShowTagDropdown(true) }}
                    onFocus={() => setShowTagDropdown(true)}
                    onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
                    placeholder="Add tag…"
                    className="w-full px-2 py-2 text-sm text-slate-700 outline-none bg-transparent"
                  />
                </div>
                {showTagDropdown && availableTags.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {availableTags.slice(0, 20).map((tag) => (
                      <button
                        key={tag.id}
                        onMouseDown={() => addTag(tag)}
                        className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span>{tag.name}</span>
                        <span className="text-gray-400 text-xs">{tag.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <button
              onClick={handlePublishClick}
              disabled={saving || !isPublishReady}
              className={`w-full text-sm font-semibold py-3 rounded-xl transition-colors mb-1 ${
                isPublishReady && !saving
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {saving ? 'Publishing…' : 'Publish Article'}
            </button>
            {!isPublishReady && (
              <p className="text-xs text-gray-400 text-center mb-2">
                Complete all required fields to publish
              </p>
            )}

            <button
              onClick={saveDraftToLocalStorage}
              className="w-full border-2 border-slate-900 text-slate-900 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors mb-2"
            >
              Save Draft
            </button>

            <button
              onClick={clearDraft}
              className="w-full border border-gray-300 text-gray-500 text-sm font-medium py-2 rounded-xl hover:bg-gray-50 transition-colors mb-2"
            >
              Clear Draft
            </button>

            <button
              onClick={() => setShowRejectModal(true)}
              disabled={saving}
              className="w-full border-2 border-red-300 text-red-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Reject Submission
            </button>
          </div>
        </div>

        {/* ── RIGHT PANEL: AI Suggestions ────────────────────────────────────── */}
        <div className="w-1/4 overflow-y-auto bg-white">
          <div className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles size={14} className="text-purple-500" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                AI Suggestions
              </p>
            </div>
            <div className="flex items-center gap-1.5 mb-4">
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                Processing Complete
              </span>
            </div>

            {/* Duplicate Check */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Duplicate Check
              </p>
              {duplicateSuggestions.length > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  {duplicateSuggestions.map((s) => (
                    <div key={s.id}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle size={12} className="text-red-500" />
                        <p className="text-xs font-semibold text-red-700">Possible duplicate</p>
                      </div>
                      <p className="text-xs text-red-600 mb-1">
                        {Math.round((s.similarity_score ?? 0) * 100)}% similarity
                      </p>
                      {duplicateTitles[s.suggested_value] && (
                        <p className="text-xs text-red-700 italic mb-1 line-clamp-2">
                          &ldquo;{duplicateTitles[s.suggested_value]}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle size={12} />
                  No duplicate content detected
                </div>
              )}
            </div>

            {/* Related coverage */}
            {relatedSuggestions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Related Coverage
                </p>
                <div className="space-y-2">
                  {relatedSuggestions.map((s) => (
                    <div key={s.id} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <p className="text-xs text-blue-700 line-clamp-2">{duplicateTitles[s.suggested_value] ?? s.suggested_value}</p>
                      <p className="text-xs text-blue-500 mt-0.5">
                        {Math.round((s.similarity_score ?? 0) * 100)}% similar
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Tags */}
            {tagSuggestions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Suggested Tags
                </p>

                {/* Active (pending) suggestions */}
                <div className="space-y-2">
                  {tagSuggestions.map((s) => {
                    const tagName = s.tag?.name ?? s.suggested_value
                    const confidence = Math.round((s.confidence_score ?? 0) * 100)
                    const isAccepted = acceptedSuggestions.has(s.id)
                    const isRejected = rejectedSuggestions.has(s.id)

                    if (isRejected) return null

                    if (isAccepted) {
                      return (
                        <div key={s.id} className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-green-800">{tagName}</span>
                            <span className="text-xs text-green-600">{confidence}%</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle size={10} />
                            <span>Applied</span>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={s.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-700">{tagName}</span>
                          <span className="text-xs text-gray-400">{confidence}%</span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => acceptTagSuggestion(s)}
                            className="flex-1 text-xs bg-slate-900 text-white py-1 rounded hover:bg-slate-700 transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => rejectTagSuggestion(s)}
                            className="flex-1 text-xs border border-gray-200 text-gray-500 py-1 rounded hover:bg-gray-50 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Rejected suggestions toggle */}
                {rejectedTagSuggestions.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowRejectedTags((v) => !v)}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      {showRejectedTags
                        ? 'Hide rejected tags'
                        : `Show ${rejectedTagSuggestions.length} rejected tag${rejectedTagSuggestions.length !== 1 ? 's' : ''}`}
                    </button>
                    {showRejectedTags && (
                      <div className="space-y-2 mt-2">
                        {rejectedTagSuggestions.map((s) => (
                          <div
                            key={s.id}
                            className="border border-gray-200 rounded-lg px-3 py-2 opacity-50"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-slate-700 line-through">
                                {s.tag?.name ?? s.suggested_value}
                              </span>
                              <span className="text-xs text-gray-400">
                                {Math.round((s.confidence_score ?? 0) * 100)}%
                              </span>
                            </div>
                            <button
                              onClick={() => restoreTagSuggestion(s)}
                              className="w-full text-xs border border-gray-300 text-gray-500 py-1 rounded hover:bg-gray-50 hover:opacity-100 transition-all"
                            >
                              Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Suggested Thread */}
            {threadSuggestions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Suggested Thread
                </p>
                {threadSuggestions.map((s) => {
                  const threadName = s.thread?.title ?? s.suggested_value
                  const confidence = Math.round((s.confidence_score ?? 0) * 100)
                  const isAccepted = acceptedSuggestions.has(s.id)

                  return (
                    <div key={s.id} className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-teal-700 mb-0.5">{threadName}</p>
                      <p className="text-xs text-teal-500 mb-2">{confidence}% match</p>
                      {isAccepted ? (
                        <div className="flex items-center gap-1 text-xs text-teal-700">
                          <CheckCircle size={10} />
                          <span>Thread applied</span>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => acceptThreadSuggestion(s)}
                            className="flex-1 text-xs bg-teal-700 text-white py-1 rounded hover:bg-teal-800 transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => setSelectedThreadId(null)}
                            className="flex-1 text-xs border border-teal-200 text-teal-600 py-1 rounded hover:bg-teal-50 transition-colors"
                          >
                            None
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {aiSuggestions.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">
                No AI suggestions generated for this item.
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Modals */}
      {showPublishModal && (
        <PublishModal
          headline={draftHeadline}
          summary={draftSummary}
          severity={selectedSeverity}
          threadTitle={selectedThread?.title ?? null}
          appliedTags={appliedTags}
          hasDuplicateWarning={hasDuplicateWarning}
          onConfirm={handlePublishConfirm}
          onCancel={() => setShowPublishModal(false)}
          saving={saving}
        />
      )}

      {showRejectModal && (
        <RejectionModal
          onConfirm={handleRejectConfirm}
          onCancel={() => setShowRejectModal(false)}
          saving={saving}
        />
      )}

      {showCreateThreadModal && (
        <CreateThreadModal
          onConfirm={handleCreateThread}
          onCancel={() => setShowCreateThreadModal(false)}
          saving={saving}
        />
      )}
    </>
  )
}
