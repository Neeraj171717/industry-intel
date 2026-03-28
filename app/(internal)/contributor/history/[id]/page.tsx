'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Shield,
  Play,
  Sparkles,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { ContributorNav } from '@/components/layout/ContributorNav'
import {
  getDisplayStatus,
  STATUS_CONFIG,
  SOURCE_TYPE_CONFIG,
  type RawItemWithSourceType,
  type DisplayStatus,
} from '@/lib/contributor'
import type { FinalItem } from '@/types'

// ─── Source icon ──────────────────────────────────────────────────────────────
function SourceIcon({ type, size = 16, className = '' }: { type: string; size?: number; className?: string }) {
  const props = { size, className }
  switch (type) {
    case 'blog': return <FileText {...props} />
    case 'official': return <Shield {...props} />
    case 'youtube': return <Play {...props} />
    case 'ai_tool': return <Sparkles {...props} />
    default: return <FileText {...props} />
  }
}

// ─── Status banner ─────────────────────────────────────────────────────────────
function StatusBanner({ status }: { status: DisplayStatus }) {
  const conf = STATUS_CONFIG[status]

  const icons: Record<DisplayStatus, React.ReactNode> = {
    pending: <Clock size={18} />,
    ai_processing: <Loader2 size={18} className="animate-spin" />,
    in_review: <Clock size={18} />,
    published: <CheckCircle size={18} />,
    rejected: <XCircle size={18} />,
  }

  const descriptions: Record<DisplayStatus, string> = {
    pending: 'Your submission has been saved and is waiting for AI processing.',
    ai_processing: 'Our AI is processing your content. Your editor will review it shortly.',
    in_review: 'An editor is currently reviewing this submission.',
    published: 'Your submission was published and is now visible to subscribers.',
    rejected: 'This submission was not selected for publishing.',
  }

  return (
    <div className={`border rounded-xl px-5 py-4 flex items-start gap-3 mb-6 ${conf.bannerBg}`}>
      <span className={conf.bannerText}>{icons[status]}</span>
      <div>
        <p className={`text-sm font-semibold ${conf.bannerText}`}>{conf.label}</p>
        <p className={`text-sm mt-0.5 ${conf.bannerText} opacity-80`}>{descriptions[status]}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type PageState = 'loading' | 'loaded' | 'not_found' | 'unauthorized' | 'error'

export default function SubmissionDetailPage() {
  const params = useParams()
  const id = params?.id as string

  const { user: currentUser, loading: sessionLoading } = useSession()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [item, setItem] = useState<RawItemWithSourceType | null>(null)
  const [publishedArticle, setPublishedArticle] = useState<FinalItem | null>(null)
  const [daysPending, setDaysPending] = useState<number>(0)

  useEffect(() => {
    if (sessionLoading || !currentUser) return

    async function load() {
      try {
        if (!id) {
          setPageState('not_found')
          return
        }

        const supabase = createBrowserSupabaseClient()
        const userId = currentUser!.id
        const spaceId = currentUser!.space_id

        if (!spaceId) {
          setPageState('error')
          return
        }

        // Fetch the raw item
        const { data, error: itemErr } = await supabase
          .from('raw_items')
          .select('*')
          .eq('id', id)
          .eq('space_id', spaceId)
          .single()

        if (itemErr || !data) {
          setPageState('not_found')
          return
        }

        // Security: contributor can only view their own submissions
        if (data.submitted_by !== userId) {
          setPageState('unauthorized')
          return
        }

        const typedItem = data as RawItemWithSourceType
        setItem(typedItem)
        setDaysPending(Math.floor((Date.now() - new Date(typedItem.created_at).getTime()) / 86400000))

        // If published, fetch the final article
        if (typedItem.status === 'processed') {
          const { data: finalItem } = await supabase
            .from('final_items')
            .select('*')
            .eq('raw_item_id', id)
            .eq('space_id', spaceId)
            .single()
          if (finalItem) setPublishedArticle(finalItem as FinalItem)
        }

        setPageState('loaded')
      } catch (err) {
        console.error('[Detail] unexpected error:', err)
        setPageState('error')
      }
    }

    load()
  }, [sessionLoading, currentUser, id])

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (sessionLoading || (pageState === 'loading' && currentUser)) {
    return (
      <>
        <ContributorNav />
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-8" />
          <div className="h-16 bg-gray-100 rounded-xl animate-pulse mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        </div>
      </>
    )
  }

  // Redirect in progress — useSession will push to /login
  if (!currentUser) return null

  // ─── Not found ─────────────────────────────────────────────────────────────
  if (pageState === 'not_found') {
    return (
      <>
        <ContributorNav />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <AlertCircle size={40} className="text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Submission not found</h2>
          <p className="text-sm text-gray-500 mb-6">This submission could not be found. It may have been removed.</p>
          <Link href="/contributor/history" className="text-sm text-slate-700 font-medium border border-gray-300 rounded-lg px-5 py-2.5 hover:bg-gray-50">
            Back to History
          </Link>
        </div>
      </>
    )
  }

  // ─── Unauthorized ──────────────────────────────────────────────────────────
  if (pageState === 'unauthorized') {
    return (
      <>
        <ContributorNav />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <XCircle size={40} className="text-red-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Not authorised</h2>
          <p className="text-sm text-gray-500 mb-6">You do not have permission to view this submission.</p>
          <Link href="/contributor/history" className="text-sm text-slate-700 font-medium border border-gray-300 rounded-lg px-5 py-2.5 hover:bg-gray-50">
            Back to History
          </Link>
        </div>
      </>
    )
  }

  // ─── Error ─────────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <>
        <ContributorNav />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-6">Could not load this submission. See browser console for details.</p>
          <Link href="/contributor/history" className="text-sm text-slate-700 font-medium border border-gray-300 rounded-lg px-5 py-2.5 hover:bg-gray-50">
            Back to History
          </Link>
        </div>
      </>
    )
  }

  // ─── Loaded ────────────────────────────────────────────────────────────────
  if (!item) return null

  const displayStatus = getDisplayStatus(item)
  const srcType = item.source_type ?? 'other'
  const srcConf = SOURCE_TYPE_CONFIG[srcType] ?? SOURCE_TYPE_CONFIG.other
  const submittedDate = new Date(item.created_at).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <>
      <ContributorNav />
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Back */}
        <Link
          href="/contributor/history"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-slate-700 mb-6 transition-colors"
        >
          <ArrowLeft size={15} className="text-teal-600" />
          Back to History
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-5">Submission Detail</h1>

        {/* Status banner */}
        <StatusBanner status={displayStatus} />

        {/* Long-pending notice */}
        {(displayStatus === 'pending' || displayStatus === 'ai_processing') && daysPending >= 7 && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-700">
            This submission has been pending for {daysPending} days. If you have questions, contact your editor.
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-6 flex-wrap">
          <div className={`flex items-center gap-1.5 font-medium ${srcConf.color}`}>
            <SourceIcon type={srcType} size={14} className={srcConf.color} />
            {srcConf.label}
          </div>
          <span>Submitted on {submittedDate}</span>
          <span className="font-mono bg-gray-100 rounded px-2 py-0.5 text-gray-600">
            #{item.id.slice(0, 8).toUpperCase()}
          </span>
        </div>

        {/* Source URL */}
        {item.source_url && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Source URL</p>
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 hover:underline break-all"
            >
              {item.source_url}
              <ExternalLink size={13} className="flex-shrink-0" />
            </a>
          </div>
        )}

        {/* Submitted content */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Submitted Content</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-sm text-slate-700 leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap">
            {item.raw_text}
          </div>
        </div>

        {/* Your notes */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your Notes</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-sm leading-relaxed">
            {item.notes
              ? <p className="text-slate-700">{item.notes}</p>
              : <p className="text-gray-400 italic">No notes were added.</p>
            }
          </div>
        </div>

        {/* Published feedback */}
        {displayStatus === 'published' && (
          <div className="mb-5 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} className="text-green-600" />
              <p className="text-sm font-semibold text-green-800">Your submission was published!</p>
            </div>
            {publishedArticle ? (
              <>
                <p className="text-sm text-green-700 mb-2">&ldquo;{publishedArticle.title}&rdquo;</p>
                <p className="text-xs text-green-600 italic">
                  Published on {new Date(publishedArticle.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </>
            ) : (
              <p className="text-sm text-green-600 italic">The published article is no longer available.</p>
            )}
          </div>
        )}

        {/* Rejected feedback */}
        {displayStatus === 'rejected' && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle size={16} className="text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">This submission was not selected</p>
            </div>
            <p className="text-sm text-amber-700">
              <span className="font-medium">Editor note:</span>{' '}
              {item.notes ? item.notes : 'No specific reason provided.'}
            </p>
          </div>
        )}

        {/* Processing notice */}
        {(displayStatus === 'pending' || displayStatus === 'ai_processing') && (
          <div className="mb-5 bg-teal-50 border border-teal-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <Loader2 size={16} className="text-teal-500 animate-spin flex-shrink-0" />
            <p className="text-sm text-teal-700">
              Our AI is processing this content. Your editor will review it soon.
            </p>
          </div>
        )}

        {/* Resubmit for rejected */}
        {displayStatus === 'rejected' && (
          <Link
            href="/contributor/submit"
            className="inline-flex items-center gap-2 border-2 border-slate-900 text-slate-900 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Submit Similar Content
          </Link>
        )}

      </div>
    </>
  )
}
