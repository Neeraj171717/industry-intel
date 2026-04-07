'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Shield, Play, Sparkles, CheckCircle, AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { ContributorNav } from '@/components/layout/ContributorNav'
import { ApprovedSourcesModal } from '@/components/contributor/ApprovedSourcesModal'

// ─── Source type config ────────────────────────────────────────────────────────
type SourceType = 'blog' | 'official' | 'youtube' | 'ai_tool'

const SOURCE_TYPES: {
  value: SourceType
  label: string
  description: string
  icon: React.ReactNode
  selectedColor: string
  selectedBg: string
  iconColor: string
}[] = [
  {
    value: 'blog',
    label: 'Blog',
    description: 'Article or blog post',
    icon: <FileText size={22} />,
    selectedColor: 'border-blue-600',
    selectedBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  {
    value: 'official',
    label: 'Official Announcement',
    description: 'Press release or platform update',
    icon: <Shield size={22} />,
    selectedColor: 'border-slate-700',
    selectedBg: 'bg-slate-50',
    iconColor: 'text-slate-700',
  },
  {
    value: 'youtube',
    label: 'YouTube',
    description: 'Video transcript or channel content',
    icon: <Play size={22} />,
    selectedColor: 'border-red-600',
    selectedBg: 'bg-red-50',
    iconColor: 'text-red-600',
  },
  {
    value: 'ai_tool',
    label: 'AI Tool',
    description: 'Release notes or AI tool updates',
    icon: <Sparkles size={22} />,
    selectedColor: 'border-purple-600',
    selectedBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
  },
]

// ─── URL validation ────────────────────────────────────────────────────────────
function isValidUrl(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false
  if (!url.includes('.')) return false
  return url.length >= 10
}

export default function ContributorSubmitPage() {
  const router = useRouter()
  const { user: currentUser, loading: sessionLoading } = useSession()

  // Form state
  const [sourceType, setSourceType] = useState<SourceType | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [content, setContent] = useState('')
  const [notes, setNotes] = useState('')
  const [featuredImage, setFeaturedImage] = useState<string | null>(null)
  const [metaTitle, setMetaTitle] = useState<string | null>(null)
  const [metaDescription, setMetaDescription] = useState<string | null>(null)

  // UI state
  const [urlTouched, setUrlTouched] = useState(false)
  const [contentTouched, setContentTouched] = useState(false)
  const [sourceTypeTouched, setSourceTypeTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [showSourcesModal, setShowSourcesModal] = useState(false)
  const [spaceName, setSpaceName] = useState<string | null>(null)

  // Metadata fetch state
  const [metaFetching, setMetaFetching] = useState(false)
  const [metaStatus, setMetaStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [metaErrorCode, setMetaErrorCode] = useState<string | null>(null)
  const [notesAiGenerated, setNotesAiGenerated] = useState(false)
  const lastFetchedUrl = useRef('')

  const contentRef = useRef<HTMLTextAreaElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!currentUser?.space_id) return

    const supabase = createBrowserSupabaseClient()
    supabase
      .from('industry_spaces').select('name').eq('id', currentUser.space_id).single()
      .then(({ data }: { data: { name: string } | null }) => { if (data) setSpaceName(data.name) })
  }, [currentUser])

  // ─── Auto-fetch metadata from URL ─────────────────────────────────────────
  const fetchMetadata = useCallback(async (url: string) => {
    if (!isValidUrl(url) || url === lastFetchedUrl.current) return
    lastFetchedUrl.current = url
    setMetaFetching(true)
    setMetaStatus('idle')

    try {
      const res = await fetch('/api/fetch-url-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()

      // Pre-fill content with full article text, falling back to description
      const extractedText = data.fullText ?? data.description
      if (extractedText && !content.trim()) {
        setContent(extractedText)
        // Allow DOM to update before auto-expanding
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.style.height = 'auto'
            contentRef.current.style.height = `${contentRef.current.scrollHeight}px`
          }
        }, 0)
      }
      if (data.siteName && !sourceName.trim()) {
        setSourceName(data.siteName)
      }
      if (data.image) {
        setFeaturedImage(data.image)
      }
      if (data.title) {
        setMetaTitle(data.title)
      }
      if (data.description) {
        setMetaDescription(data.description)
      }
      if (data.editorNotes && !notes.trim()) {
        setNotes(data.editorNotes)
        setNotesAiGenerated(true)
        setTimeout(() => {
          if (notesRef.current) {
            notesRef.current.style.height = 'auto'
            notesRef.current.style.height = `${notesRef.current.scrollHeight}px`
          }
        }, 0)
      }

      if (data.errorCode) {
        setMetaStatus('error')
        setMetaErrorCode(data.errorCode)
      } else if (data.title || data.fullText || data.description || data.siteName) {
        setMetaStatus('success')
        setMetaErrorCode(null)
      } else {
        setMetaStatus('error')
        setMetaErrorCode('no_content')
      }
    } catch {
      setMetaStatus('error')
      setMetaErrorCode(null)
    } finally {
      setMetaFetching(false)
    }
  }, [content, sourceName, notes])

  useEffect(() => {
    if (!isValidUrl(sourceUrl) || sourceUrl === lastFetchedUrl.current) return
    const timer = setTimeout(() => fetchMetadata(sourceUrl), 800)
    return () => clearTimeout(timer)
  }, [sourceUrl, fetchMetadata])

  // Warn before leaving with unsaved content
  useEffect(() => {
    const hasContent = Boolean(sourceType || sourceUrl.trim() || sourceName.trim() || content.trim() || notes.trim())
    if (!hasContent || success) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [sourceType, sourceUrl, sourceName, content, notes, success])

  // ─── Validation ─────────────────────────────────────────────────────────────
  const urlError = urlTouched && !isValidUrl(sourceUrl)
    ? 'Please enter a valid URL starting with https://'
    : null

  const contentError = contentTouched && content.trim().length < 50
    ? 'Please paste the content you want to submit.'
    : null

  const sourceTypeError = sourceTypeTouched && !sourceType
    ? 'Please select a source type to continue.'
    : null

  const contentShortWarning = content.trim().length > 0 && content.trim().length < 100
    ? 'Your content seems very short. For best results please paste the complete text.'
    : null

  const canSubmit =
    !sessionLoading &&
    currentUser !== null &&
    sourceType !== null &&
    isValidUrl(sourceUrl) &&
    content.trim().length >= 50 &&
    !submitting

  // ─── Auto-expand textarea ────────────────────────────────────────────────────
  function autoExpand(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSourceTypeTouched(true)
    setUrlTouched(true)
    setContentTouched(true)

    if (!canSubmit) return

    if (!currentUser) {
      setServerError('Session not ready. Please wait a moment and try again, or refresh the page.')
      return
    }

    setSubmitting(true)
    setServerError(null)

    try {
      const supabase = createBrowserSupabaseClient()
      const { error } = await supabase.from('raw_items').insert({
        space_id: currentUser.space_id,
        submitted_by: currentUser.id,
        source_type: sourceType,
        source_url: sourceUrl.trim(),
        source_name: sourceName.trim() || null,
        featured_image: featuredImage,
        title: metaTitle,
        description: metaDescription,
        raw_text: content.trim(),
        notes: notes.trim() || null,
        status: 'pending',
        ai_processed: false,
      })

      if (error) throw error

      setSuccess(true)
    } catch {
      setServerError('Something went wrong. Your content was not saved. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setSourceType(null)
    setSourceUrl('')
    setSourceName('')
    setContent('')
    setMetaTitle(null)
    setMetaDescription(null)
    setNotes('')
    setFeaturedImage(null)
    setUrlTouched(false)
    setContentTouched(false)
    setSourceTypeTouched(false)
    setSuccess(false)
    setServerError(null)
    setMetaStatus('idle')
    setMetaErrorCode(null)
    setNotesAiGenerated(false)
    lastFetchedUrl.current = ''
  }

  // ─── Success state ───────────────────────────────────────────────────────────
  if (success) {
    return (
      <>
        <ContributorNav />
        <div className="max-w-2xl mx-auto px-6 py-10">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-10 text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle size={48} className="text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Submitted successfully!</h2>
            <p className="text-sm text-gray-600 mb-1">
              Our AI is processing your content.
            </p>
            <p className="text-sm text-gray-500 mb-8">
              Your editor will review it shortly. Track its progress in your History.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={resetForm}
                className="bg-slate-900 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Submit Another
              </button>
              <button
                onClick={() => router.push('/contributor/history')}
                className="border border-slate-300 text-slate-700 text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                View in History
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <ContributorNav />
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Submit Content</h1>
            <p className="text-sm text-gray-500 mt-1">
              Share valuable industry content with your editorial team
            </p>
          </div>
          <button
            onClick={() => setShowSourcesModal(true)}
            className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium mt-1 flex-shrink-0"
          >
            <ExternalLink size={14} />
            View approved sources
          </button>
        </div>

        {/* Server error banner */}
        {serverError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>

          {/* ── Field 1: Source Type ─────────────────────────────────────── */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Source Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {SOURCE_TYPES.map((st) => {
                const isSelected = sourceType === st.value
                return (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => { setSourceType(st.value); setSourceTypeTouched(true) }}
                    className={`relative text-left rounded-xl border-2 px-4 py-3 transition-all ${
                      isSelected
                        ? `${st.selectedColor} ${st.selectedBg}`
                        : sourceTypeError
                          ? 'border-red-300 hover:border-gray-300'
                          : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-2 right-2">
                        <CheckCircle size={14} className="text-slate-600" />
                      </span>
                    )}
                    <span className={`block mb-1 ${isSelected ? st.iconColor : 'text-gray-500'}`}>
                      {st.icon}
                    </span>
                    <span className={`block text-sm font-semibold ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                      {st.label}
                    </span>
                    <span className="block text-xs text-gray-400 mt-0.5">{st.description}</span>
                  </button>
                )
              })}
            </div>
            {sourceTypeError && (
              <p className="mt-2 text-sm text-red-600">{sourceTypeError}</p>
            )}
          </div>

          {/* ── Field 2: Source URL ──────────────────────────────────────── */}
          <div className="mb-6">
            <label htmlFor="sourceUrl" className="block text-sm font-semibold text-slate-700 mb-1">
              Source URL <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">The direct link to the original content</p>
            <div className="relative">
              <input
                id="sourceUrl"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                onBlur={() => setUrlTouched(true)}
                placeholder="https://www.example.com/article"
                className={`w-full h-12 rounded-lg border px-4 pr-10 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition ${
                  urlError ? 'border-red-400' : 'border-gray-300'
                }`}
                disabled={submitting}
              />
              {metaFetching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                </span>
              )}
            </div>
            {urlError && <p className="mt-1.5 text-sm text-red-600">{urlError}</p>}
            {metaStatus === 'success' && (
              <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                <p className="text-xs text-green-700">Metadata fetched — please review and edit</p>
              </div>
            )}
            {metaStatus === 'error' && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertCircle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  {metaErrorCode === 'blocked'
                    ? 'This website does not allow automated content fetching. Please copy and paste the article text manually.'
                    : metaErrorCode === 'unreachable'
                    ? 'Could not reach this URL. Please check the link is correct and try again.'
                    : metaErrorCode === 'timeout'
                    ? 'This website is taking too long to respond. Please paste the content manually.'
                    : metaErrorCode === 'no_content'
                    ? 'Could not extract content from this page. Please paste the article text manually.'
                    : 'Could not fetch metadata — please paste content manually.'}
                </p>
              </div>
            )}
          </div>

          {/* ── Field 2b: Source Name ────────────────────────────────────── */}
          <div className="mb-6">
            <label htmlFor="sourceName" className="block text-sm font-semibold text-slate-700 mb-1">
              Source Name <span className="ml-1 text-xs text-gray-400 font-normal">optional</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">Leave blank to auto-detect from URL</p>
            <input
              id="sourceName"
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="e.g. Search Engine Land, Neil Patel YouTube, OpenAI Blog"
              className="w-full h-12 rounded-lg border border-gray-300 px-4 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
              disabled={submitting}
            />
          </div>

          {/* ── Field 3: Content ─────────────────────────────────────────── */}
          <div className="mb-6">
            <label htmlFor="content" className="block text-sm font-semibold text-slate-700 mb-1">
              Content <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Paste the full text, transcript, or announcement. The more complete the content, the better our AI can process it.
            </p>
            <div className="relative">
              <textarea
                id="content"
                ref={contentRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  autoExpand(e.target)
                }}
                onBlur={() => setContentTouched(true)}
                placeholder="Paste the full article text, video transcript, or announcement here..."
                style={{ minHeight: '280px' }}
                className={`w-full rounded-lg border px-4 py-3 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition leading-relaxed resize-none ${
                  contentError ? 'border-red-400' : 'border-gray-300'
                }`}
                disabled={submitting}
              />
              <span className="absolute bottom-3 right-3 text-xs text-gray-400 pointer-events-none">
                {content.length.toLocaleString()} characters
              </span>
            </div>
            {contentShortWarning && !contentError && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                {contentShortWarning}
              </div>
            )}
            {contentError && <p className="mt-1.5 text-sm text-red-600">{contentError}</p>}
          </div>

          {/* ── Field 4: Notes for Editor ────────────────────────────────── */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <label htmlFor="notes" className="block text-sm font-semibold text-slate-700">
                Notes for Editor
                <span className="ml-2 text-xs text-gray-400 font-normal">optional</span>
              </label>
              {notesAiGenerated && (
                <span className="inline-flex items-center gap-1 bg-teal-50 border border-teal-200 text-teal-700 text-[11px] font-medium px-2 py-0.5 rounded-full">
                  <Sparkles size={10} />
                  AI generated — please review
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Why does this matter? Who in the industry will be affected? Any context the editor should know?
            </p>
            <div className="relative">
              <textarea
                id="notes"
                ref={notesRef}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value)
                  autoExpand(e.target)
                }}
                placeholder="e.g. This is significant because Google rarely confirms core updates publicly. Major impact expected for AI-generated content sites within our audience."
                style={{ minHeight: '120px' }}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition leading-relaxed resize-none"
                disabled={submitting}
              />
              <span className="absolute bottom-3 right-3 text-xs text-gray-400 pointer-events-none">
                {notes.length.toLocaleString()} characters
              </span>
            </div>

            {/* AI notes loading indicator */}
            {metaFetching && !notes.trim() && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin" />
                Generating editor notes...
              </div>
            )}

            {/* Encouragement box */}
            {!notesAiGenerated && !metaFetching && (
              <div className="mt-3 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 flex items-start gap-2">
                <CheckCircle size={14} className="text-teal-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-teal-700">
                  Contributors who include detailed notes have a <span className="font-semibold">40% higher publication rate</span>.
                </p>
              </div>
            )}
          </div>

          {/* ── Submit button ────────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-13 rounded-lg bg-slate-900 px-4 py-3.5 text-base font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {(submitting || sessionLoading) && <Loader2 size={16} className="animate-spin" />}
            {submitting ? 'Submitting…' : sessionLoading ? 'Loading session…' : 'Submit for Review'}
          </button>

          <p className="mt-3 text-xs text-center text-gray-400">
            Your submission will be reviewed by our editorial team. You will be able to track its progress in your History.
          </p>

        </form>
      </div>

      {showSourcesModal && currentUser?.space_id && (
        <ApprovedSourcesModal
          spaceId={currentUser.space_id}
          spaceName={spaceName}
          onClose={() => setShowSourcesModal(false)}
        />
      )}
    </>
  )
}
