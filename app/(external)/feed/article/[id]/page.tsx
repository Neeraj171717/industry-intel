'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { SignUpPromptModal } from '@/components/feed/SignUpPromptModal'
import { addAnonRead, addAnonSaveAttempt } from '@/lib/anon'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArticleData {
  id: string
  title: string
  summary: string
  body: string
  content_type: string | null
  severity: string | null
  locality: string | null
  impact: string | null
  published_at: string
  thread_id: string | null
  source_name: string | null
  source_url: string | null
  thread: { id: string; title: string } | null
  article_tags: { tag_id: string }[]
  related: { id: string; title: string; published_at: string }[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-[#E84C4C]/15 text-[#E84C4C]',
  high:     'bg-[#E8A84C]/15 text-[#E8A84C]',
  medium:   'bg-[#00C2A8]/15 text-[#00C2A8]',
  low:      'bg-[#555555]/20 text-[#888888]',
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-l-[#E84C4C]',
  high:     'border-l-[#E8A84C]',
  medium:   'border-l-[#00C2A8]',
  low:      'border-l-[#555555]',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Article View ──────────────────────────────────────────────────────────────

export default function ArticleViewPage() {
  const { user, loading: sessionLoading } = useSession({ required: false })
  const params   = useParams()
  const router   = useRouter()
  const articleId = params.id as string

  const isAnon = !sessionLoading && !user

  const [article, setArticle]   = useState<ArticleData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)
  const [isSaved, setIsSaved]   = useState(false)
  const [marking, setMarking]   = useState(false)
  const [signUpPromptOpen, setSignUpPromptOpen] = useState(false)

  useEffect(() => {
    async function load() {
      if (sessionLoading) return
      setLoading(true)
      setError(false)
      try {
        // Fetch article via public endpoint (works for both auth and anon)
        const res = await fetch(`/api/public-article/${articleId}`)
        if (!res.ok) throw new Error('fetch failed')
        const { article: data } = await res.json()
        if (!data) throw new Error('not found')

        // Authenticated users: check saved state via browser client
        if (user) {
          const supabase = createBrowserSupabaseClient()
          const { data: interaction } = await supabase
            .from('user_interactions')
            .select('action')
            .eq('final_item_id', articleId)
            .maybeSingle()
          setIsSaved(interaction?.action === 'saved')
        }

        setArticle(data as ArticleData)

        // Anonymous: record read locally for suppression + tag affinity
        if (!user) {
          const tagIds = (data.article_tags ?? []).map((t: { tag_id: string }) => t.tag_id)
          addAnonRead(articleId, tagIds)
        }
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    if (articleId) load()
  }, [articleId, sessionLoading, user])

  const markAsRead = useCallback(async () => {
    if (marking) return
    // Anonymous users already recorded the read on load — no server-side work
    if (isAnon) return
    setMarking(true)
    try {
      const tagIds = article?.article_tags?.map(t => t.tag_id) ?? []

      await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          final_item_id: articleId,
          action: 'read',
          thread_id: article?.thread_id ?? null,
        }),
      })

      if (tagIds.length > 0) {
        await fetch('/api/update-weights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagIds, action: 'read' }),
        })
      }
    } catch (err) {
      console.error('[ArticleView] markAsRead error:', err)
    }
  }, [articleId, article, marking, isAnon])

  const handleBack = useCallback(async () => {
    await markAsRead()
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push('/feed')
    }
  }, [markAsRead, router])

  const toggleBookmark = useCallback(async () => {
    // Anonymous users can't save — prompt signup instead
    if (isAnon) {
      addAnonSaveAttempt(articleId)
      setSignUpPromptOpen(true)
      return
    }

    const newSaved = !isSaved
    setIsSaved(newSaved)
    await fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        final_item_id: articleId,
        action: newSaved ? 'saved' : 'unsaved',
      }),
    })
  }, [isSaved, articleId, isAnon])

  const handleShare = useCallback(() => {
    if (navigator.share && article) {
      void navigator.share({ title: article.title, url: window.location.href })
    } else {
      void navigator.clipboard.writeText(window.location.href)
    }
  }, [article])

  // ── States ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex flex-col max-w-[430px] mx-auto">
        <header className="flex items-center justify-between px-4 h-14 border-b border-[#1A2030]">
          <div className="w-8 h-8 bg-[#161B22] rounded-full animate-pulse" />
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-[#161B22] rounded-full animate-pulse" />
            <div className="w-8 h-8 bg-[#161B22] rounded-full animate-pulse" />
          </div>
        </header>
        <div className="p-4 space-y-3 animate-pulse">
          <div className="h-4 bg-[#161B22] rounded w-20" />
          <div className="h-7 bg-[#161B22] rounded w-full" />
          <div className="h-7 bg-[#161B22] rounded w-5/6" />
          <div className="h-4 bg-[#161B22] rounded w-40 mt-2" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-4 bg-[#161B22] rounded w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex flex-col items-center justify-center max-w-[430px] mx-auto px-6 text-center">
        <p className="text-white font-semibold mb-2">Could not load this article</p>
        <p className="text-[#444D5A] text-[14px] mb-6">Tap retry or go back to your feed</p>
        <div className="flex gap-3">
          <button onClick={() => window.location.reload()} className="bg-[#00C2A8] text-white px-4 py-2.5 rounded-xl text-[14px] font-medium">
            Retry
          </button>
          <button onClick={() => router.push('/feed')} className="border border-[#1E2530] text-[#888888] px-4 py-2.5 rounded-xl text-[14px]">
            Back to Feed
          </button>
        </div>
      </div>
    )
  }

  const badgeClass    = SEVERITY_BADGE[article.severity ?? 'low'] ?? SEVERITY_BADGE.low
  const borderClass   = SEVERITY_BORDER[article.severity ?? 'low'] ?? SEVERITY_BORDER.low
  const typeLabel     = article.content_type?.replace(/_/g, ' ').toUpperCase() ?? ''

  // Derive display source: source_name → domain from source_url → fallback
  let sourceName = 'Industry Intel'
  if (article.source_name) {
    sourceName = article.source_name
  } else if (article.source_url) {
    try { sourceName = new URL(article.source_url).hostname.replace(/^www\./, '') } catch { /* keep fallback */ }
  }
  const sourceUrl = article.source_url ?? null

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col max-w-[430px] mx-auto">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 h-14 bg-[#0D1117] border-b border-[#1A2030] sticky top-0 z-40">
        <button
          onClick={handleBack}
          className="p-1.5 -ml-1.5 text-[#888888] hover:text-white transition-colors"
          aria-label="Back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={handleShare} className="p-1.5 text-[#888888] hover:text-white transition-colors" aria-label="Share">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
          <button onClick={toggleBookmark} className="p-1.5 text-[#888888] hover:text-white transition-colors" aria-label="Bookmark">
            {isSaved ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#00C2A8" stroke="#00C2A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-8">

        {/* Severity + type badges */}
        <div className={`flex items-center gap-2 px-4 pt-4 mb-4`}>
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${badgeClass}`}>
            {article.severity ?? 'low'}
          </span>
          {typeLabel && (
            <span className="text-[10px] font-medium uppercase tracking-wide px-2.5 py-1 rounded-full bg-[#252B36] text-[#666666]">
              {typeLabel}
            </span>
          )}
        </div>

        {/* Thread update banner */}
        {article.thread && (
          <div className={`mx-4 mb-4 flex items-start gap-3 bg-[#00C2A8]/10 border border-[#00C2A8]/20 rounded-xl px-3 py-2.5 border-l-4 ${borderClass}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#00C2A8" className="mt-0.5 shrink-0">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <div>
              <p className="text-[11px] text-[#00C2A8] font-medium mb-0.5">This is an update to:</p>
              <p className="text-[13px] text-white font-medium">{article.thread.title}</p>
            </div>
          </div>
        )}

        {/* Headline */}
        <h1 className="text-[24px] font-bold text-white leading-tight px-4 mb-3">
          {article.title}
        </h1>

        {/* Meta row */}
        <div className="flex items-center gap-2 px-4 mb-5">
          <span className="text-[12px] text-[#444D5A]">
            {sourceName}
          </span>
          <span className="text-[#2C3444]">·</span>
          <span className="text-[12px] text-[#444D5A]">{formatDate(article.published_at)}</span>
        </div>

        {/* Summary */}
        <div className={`mx-4 mb-5 bg-[#161B22] border-l-4 ${borderClass} rounded-r-xl px-4 py-3`}>
          <p className="text-[14px] text-[#8899AA] leading-relaxed">{article.summary}</p>
        </div>

        {/* Divider */}
        <div className="mx-4 mb-5 border-t border-[#1A2030]" />

        {/* Body */}
        <div className="px-4 mb-6">
          <p className="text-[15px] text-[#B0BEC5] leading-[1.75] whitespace-pre-wrap">
            {article.body}
          </p>
        </div>

        {/* Source link */}
        {sourceUrl && (
          <div className="mx-4 mb-6">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[#00C2A8] text-[14px] font-medium"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Read original source — {sourceName}
            </a>
          </div>
        )}

        {/* Related thread articles */}
        {article.related.length > 0 && (
          <div className="mx-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#444D5A] mb-3">
              Related articles in this story
            </p>
            <div className="space-y-2">
              {article.related.map(rel => (
                <button
                  key={rel.id}
                  onClick={() => router.push(`/feed/article/${rel.id}`)}
                  className="w-full text-left bg-[#161B22] rounded-xl px-4 py-3 border border-[#1E2530] hover:border-[#2C3444] transition-colors"
                >
                  <p className="text-[14px] text-white font-medium line-clamp-2 mb-1">{rel.title}</p>
                  <p className="text-[12px] text-[#444D5A]">{formatDate(rel.published_at)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom padding so content clears any safe areas */}
        <div className="h-10" />
      </div>

      {/* ── Anonymous save prompt ──────────────────────────────────────── */}
      <SignUpPromptModal
        open={signUpPromptOpen}
        onClose={() => setSignUpPromptOpen(false)}
        articleTitle={article.title}
        reason="save"
      />
    </div>
  )
}
