'use client'

import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { EndUserNav } from '@/components/layout/EndUserNav'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeedArticle {
  id: string
  headline: string
  summary: string | null
  featured_image: string | null
  content_type: string | null
  severity: string | null
  published_at: string
  author_name: string | null
  source_name: string | null
  source_url: string | null
  thread_id: string | null
  thread_title: string | null
  is_thread_update: boolean
  score: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_BORDER: Record<string, string> = {
  critical: '#E84C4C',
  high:     '#E8A84C',
  medium:   '#00C2A8',
  low:      '#555555',
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-[#E84C4C]/15 text-[#E84C4C]',
  high:     'bg-[#E8A84C]/15 text-[#E8A84C]',
  medium:   'bg-[#00C2A8]/15 text-[#00C2A8]',
  low:      'bg-[#555555]/20 text-[#888888]',
}

function extractSourceName(sourceName: string | null | undefined, sourceUrl: string | null | undefined): string {
  if (sourceName) return sourceName
  if (sourceUrl) {
    try {
      const hostname = new URL(sourceUrl).hostname.replace(/^www\./, '')
      return hostname.charAt(0).toUpperCase() + hostname.slice(1)
    } catch {
      // fall through
    }
  }
  return 'Industry Intel'
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── Article Card ──────────────────────────────────────────────────────────────

interface CardProps {
  article: FeedArticle
  isTop: boolean
  stackIndex: number
  isSaved: boolean
  onExit: (dir: 'left' | 'right') => void
  onBookmark: () => void
  onTap: () => void
  triggerSaveExit: boolean
}

function ArticleCard({ article, isTop, stackIndex, isSaved, onExit, onBookmark, onTap, triggerSaveExit }: CardProps) {
  const x            = useMotionValue(0)
  const rotate       = useTransform(x, [-300, 0, 300], [-18, 0, 18])
  const greenOpacity = useTransform(x, [20, 110], [0, 1])
  const redOpacity   = useTransform(x, [-110, -20], [1, 0])
  const isDragging   = useRef(false)

  // Programmatic exit animation triggered by bookmark
  useEffect(() => {
    if (!triggerSaveExit || !isTop) return
    const W = typeof window !== 'undefined' ? window.innerWidth : 400
    animate(x, W + 300, { duration: 0.28, ease: [0.25, 1, 0.5, 1], onComplete: () => onExit('right') })
  }, [triggerSaveExit]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragStart = useCallback(() => { isDragging.current = true }, [])

  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const W = typeof window !== 'undefined' ? window.innerWidth : 400
    const THRESHOLD = W * 0.38

    if (info.offset.x > THRESHOLD) {
      animate(x, W + 300, { duration: 0.22, ease: [0.25, 1, 0.5, 1], onComplete: () => onExit('right') })
    } else if (info.offset.x < -THRESHOLD) {
      animate(x, -(W + 300), { duration: 0.22, ease: [0.25, 1, 0.5, 1], onComplete: () => onExit('left') })
    } else {
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 })
      setTimeout(() => { isDragging.current = false }, 80)
    }
  }, [x, onExit])

  const handleClick = useCallback(() => {
    if (!isDragging.current) onTap()
  }, [onTap])

  const borderColor = SEVERITY_BORDER[article.severity ?? 'low'] ?? '#555555'
  const badgeClass  = SEVERITY_BADGE[article.severity ?? 'low'] ?? SEVERITY_BADGE.low
  const typeLabel   = article.content_type?.replace(/_/g, ' ').toUpperCase() ?? ''

  return (
    <motion.div
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: -9999, right: 9999 }}
      dragMomentum={false}
      dragElastic={0}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      animate={{ scale: 1 - stackIndex * 0.032, y: stackIndex * 16 }}
      style={{
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        position: 'absolute',
        left: 0, right: 0, top: 0,
        zIndex: 30 - stackIndex,
        borderLeft: `4px solid ${borderColor}`,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`bg-[#161B22] rounded-2xl overflow-hidden select-none shadow-lg border border-gray-700 ${isTop ? 'cursor-grab active:cursor-grabbing shadow-[0_8px_32px_rgba(0,0,0,0.5)]' : ''}`}
      onClick={handleClick}
    >
      {/* ── Swipe indicators ──────────────────────────────────────────────── */}
      {isTop && (
        <>
          <motion.div
            style={{ opacity: greenOpacity }}
            className="absolute inset-0 z-20 flex items-center justify-start pl-5 pointer-events-none rounded-2xl bg-[#00C2A8]/10"
          >
            <div className="bg-[#00C2A8] rounded-full p-2.5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </motion.div>
          <motion.div
            style={{ opacity: redOpacity }}
            className="absolute inset-0 z-20 flex items-center justify-end pr-5 pointer-events-none rounded-2xl bg-[#E84C4C]/10"
          >
            <div className="bg-[#E84C4C] rounded-full p-2.5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
          </motion.div>
        </>
      )}

      {/* ── Featured image ─────────────────────────────────────────────── */}
      {article.featured_image && (
        <div className="w-full h-[180px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.featured_image}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}

      {/* ── Card content ──────────────────────────────────────────────────── */}
      <div className="p-4">
        {/* Badges */}
        <div className="flex items-center justify-between mb-3">
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
        {article.is_thread_update && article.thread_title && (
          <div className="flex items-center gap-2 bg-[#00C2A8]/10 border border-[#00C2A8]/20 rounded-xl px-3 py-2 mb-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#00C2A8">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span className="text-[12px] text-[#00C2A8] font-medium leading-tight">
              New update to a story you followed
            </span>
          </div>
        )}

        {/* Headline */}
        <h2 className="text-[18px] font-bold text-white leading-snug mb-2 line-clamp-2">
          {article.headline}
        </h2>

        {/* Summary */}
        {article.summary && (
          <p className="text-[13px] leading-snug line-clamp-3 mb-2" style={{ color: '#AAAAAA' }}>
            {article.summary}
          </p>
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1E2530]">
          <span className="text-[12px] text-[#444D5A]">
            {extractSourceName(article.source_name, article.source_url)} · {timeAgo(article.published_at)}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onBookmark() }}
            className="p-1 -mr-1 touch-manipulation"
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark'}
          >
            {isSaved ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#00C2A8" stroke="#00C2A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00C2A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Feed Page ─────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const { user, loading: sessionLoading } = useSession({ required: true })
  const router = useRouter()

  const [allCards, setAllCards]     = useState<FeedArticle[]>([])
  const [loading, setLoading]       = useState(true)
  const [hasMore, setHasMore]       = useState(false)
  const [noPrefs, setNoPrefs]       = useState(false)
  const [savedIds, setSavedIds]     = useState<Set<string>>(new Set())
  const [toast, setToast]           = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [savingCardId, setSavingCardId] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  const fetchFeed = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch('/api/feed-algorithm?offset=0')
      if (!res.ok) throw new Error('Feed failed')
      const data = await res.json()
      if (data.message?.includes('preferences') || data.message?.includes('Complete')) {
        setNoPrefs(true)
        setAllCards([])
      } else {
        setNoPrefs(false)
        setAllCards(data.items ?? [])
        setHasMore(data.hasMore ?? false)
      }
    } catch (err) {
      console.error('[FeedPage]', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!sessionLoading && user) fetchFeed()
  }, [sessionLoading, user, fetchFeed])

  // Load more when running low
  const loadMore = useCallback(async () => {
    if (!hasMore || allCards.length > 4) return
    try {
      const res = await fetch(`/api/feed-algorithm?offset=${allCards.length}`)
      if (!res.ok) return
      const data = await res.json()
      setAllCards(prev => [...prev, ...(data.items ?? [])])
      setHasMore(data.hasMore ?? false)
    } catch { /* silent */ }
  }, [hasMore, allCards.length])

  const visibleCards = allCards.slice(0, 3)

  const handleExit = useCallback((article: FeedArticle, dir: 'left' | 'right') => {
    // If this card was bookmark-exiting, just remove it — don't navigate
    if (savingCardId === article.id) {
      setSavingCardId(null)
      setAllCards(prev => prev.filter(c => c.id !== article.id))
      setTimeout(loadMore, 150)
      return
    }

    setAllCards(prev => prev.filter(c => c.id !== article.id))

    if (dir === 'right') {
      router.push(`/feed/article/${article.id}`)
    } else {
      void fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_item_id: article.id, action: 'ignored', thread_id: article.thread_id }),
      })
    }

    setTimeout(loadMore, 150)
  }, [router, loadMore, savingCardId])

  const handleTap = useCallback((article: FeedArticle) => {
    setAllCards(prev => prev.filter(c => c.id !== article.id))
    router.push(`/feed/article/${article.id}`)
  }, [router])

  const handleBookmark = useCallback((article: FeedArticle) => {
    // Save to library and animate card away
    setSavedIds(prev => new Set(Array.from(prev).concat(article.id)))
    showToast('Saved to Library')
    void fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_item_id: article.id, action: 'saved' }),
    })
    // Trigger the slide-out animation
    setSavingCardId(article.id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00C2A8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col max-w-[430px] mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 h-14 bg-[#0D1117] border-b border-[#1A2030] sticky top-0 z-40">
        <span className="text-white font-bold text-[17px] tracking-tight">Industry Intel</span>
        <Link href="/notifications" className="relative p-1.5 -mr-1.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#888888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 bg-[#E84C4C] rounded-full border border-[#0D1117]" />
        </Link>
      </header>

      {/* ── Feed counter ────────────────────────────────────────────────── */}
      <div className="h-8 flex items-center justify-center">
        <span className="text-[12px] text-[#444D5A]">
          {loading
            ? 'Loading your feed…'
            : allCards.length > 0
              ? `${allCards.length} ${allCards.length === 1 ? 'story' : 'stories'} curated for you today`
              : ''}
        </span>
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col pb-[72px]">

        {/* Loading skeleton */}
        {loading && (
          <div className="mx-4 mt-2 animate-pulse">
            <div className="bg-[#161B22] rounded-2xl p-4 border-l-4 border-[#1E2530]">
              <div className="flex justify-between mb-3">
                <div className="h-5 w-14 bg-[#1E2530] rounded-full" />
                <div className="h-5 w-20 bg-[#1E2530] rounded-full" />
              </div>
              <div className="h-5 bg-[#1E2530] rounded w-full mb-2" />
              <div className="h-5 bg-[#1E2530] rounded w-4/5 mb-4" />
              <div className="h-3 bg-[#1E2530] rounded w-1/3" />
            </div>
          </div>
        )}

        {/* No preferences */}
        {!loading && noPrefs && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-16 h-16 bg-[#161B22] rounded-2xl flex items-center justify-center mb-5 border border-[#1E2530]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00C2A8" strokeWidth="1.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <h2 className="text-white font-bold text-[20px] mb-2">Personalise your feed</h2>
            <p className="text-[#444D5A] text-[14px] leading-relaxed mb-6">
              Select the topics you care about so we can curate the most relevant stories for you.
            </p>
            <Link href="/setup" className="bg-[#00C2A8] text-white font-semibold px-6 py-3 rounded-xl text-[15px]">
              Complete preferences
            </Link>
          </div>
        )}

        {/* All caught up */}
        {!loading && !noPrefs && allCards.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-16 h-16 bg-[#161B22] rounded-2xl flex items-center justify-center mb-5 border border-[#1E2530]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00C2A8" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-white font-bold text-[20px] mb-2">You are all caught up</h2>
            <p className="text-[#444D5A] text-[14px] mb-6">Check back later for new stories</p>
            <button
              onClick={() => fetchFeed(true)}
              disabled={refreshing}
              className="flex items-center gap-2 border border-[#1E2530] text-[#666666] px-5 py-2.5 rounded-xl text-[14px] disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={refreshing ? 'animate-spin' : ''}>
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {refreshing ? 'Refreshing…' : 'Refresh feed'}
            </button>
          </div>
        )}

        {/* ── Card stack ──────────────────────────────────────────────── */}
        {!loading && allCards.length > 0 && (
          <>
            {/* Stack container — height accommodates card + peek of cards behind */}
            <div className="relative mx-4 mt-1" style={{ height: 460 }}>
              {visibleCards.slice().reverse().map((article, ri) => {
                const stackIndex = visibleCards.length - 1 - ri
                return (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    isTop={stackIndex === 0}
                    stackIndex={stackIndex}
                    isSaved={savedIds.has(article.id)}
                    onExit={(dir) => handleExit(article, dir)}
                    onBookmark={() => handleBookmark(article)}
                    onTap={() => handleTap(article)}
                    triggerSaveExit={savingCardId === article.id}
                  />
                )
              })}
            </div>

            {/* Swipe hints */}
            <div className="flex items-center justify-between px-8 mt-3">
              <div className="flex items-center gap-1.5 text-[#2C3240]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
                <span className="text-[11px] font-medium">Ignore</span>
              </div>
              <span className="text-[11px] text-[#2C3240]">tap to read</span>
              <div className="flex items-center gap-1.5 text-[#2C3240]">
                <span className="text-[11px] font-medium">Read</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Bottom nav ──────────────────────────────────────────────────── */}
      <EndUserNav />

      {/* ── Toast ───────────────────────────────────────────────────────── */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#1E2530] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-xl border border-[#2C3444]"
        >
          {toast}
        </motion.div>
      )}
    </div>
  )
}
