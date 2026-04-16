'use client'

import { motion, PanInfo } from 'framer-motion'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { Heart, Bookmark, BookmarkCheck, SlidersHorizontal } from 'lucide-react'
import { EndUserNav } from '@/components/layout/EndUserNav'
import { DesktopSidebar } from '@/components/feed/DesktopSidebar'
import { PersonalizePanel } from '@/components/feed/PersonalizePanel'
import { MobileSwipeOverlay } from '@/components/feed/MobileSwipeOverlay'
import { IndustryPickerModal } from '@/components/feed/IndustryPickerModal'
import { SignUpPromptModal } from '@/components/feed/SignUpPromptModal'
import {
  addAnonIgnored,
  addAnonSaveAttempt,
  getSuppressedIds,
} from '@/lib/anon'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeedArticle {
  id: string
  headline: string
  summary: string | null
  featured_image: string | null
  content_type: string | null
  severity: string | null
  published_at: string
  source_name: string | null
  source_url: string | null
  thread_id: string | null
  thread_title: string | null
  is_thread_update: boolean
  score: number
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
      const h = new URL(sourceUrl).hostname.replace(/^www\./, '')
      return h.charAt(0).toUpperCase() + h.slice(1)
    } catch { /* fall through */ }
  }
  return 'Industry Intel'
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Desktop card variants ────────────────────────────────────────────────────

interface DesktopCardProps {
  article: FeedArticle
  isSaved: boolean
  isLiked: boolean
  onLike: () => void
  onBookmark: () => void
  onTap: () => void
  variant: 'hero' | 'grid'
}

function DesktopCard({ article, isSaved, isLiked, onLike, onBookmark, onTap, variant }: DesktopCardProps) {
  const badgeClass = SEVERITY_BADGE[article.severity ?? 'low'] ?? SEVERITY_BADGE.low
  const isHero = variant === 'hero'

  return (
    <article
      onClick={onTap}
      className={`relative bg-[#161B22] rounded-2xl overflow-hidden border border-[#1E2530] hover:border-[#2C3444] cursor-pointer transition-colors group ${
        isHero ? '' : 'h-full flex flex-col'
      }`}
    >
      {/* Card actions (top-right) */}
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <ActionButton onClick={onLike} active={isLiked} activeColor="#E84C4C" label={isLiked ? 'Unlike' : 'Like'}>
          <Heart size={14} fill={isLiked ? '#E84C4C' : 'none'} />
        </ActionButton>
        <ActionButton onClick={onBookmark} active={isSaved} activeColor="#00C2A8" label={isSaved ? 'Remove bookmark' : 'Save'}>
          {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
        </ActionButton>
      </div>

      {article.featured_image && (
        <div className={`w-full overflow-hidden ${isHero ? 'h-[280px]' : 'h-[140px]'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.featured_image}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}

      <div className={`${isHero ? 'p-5' : 'p-4 flex-1 flex flex-col'}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeClass}`}>
            {article.severity ?? 'low'}
          </span>
          {article.content_type && (
            <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#1E2530] text-[#666]">
              {article.content_type.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        <h2 className={`font-bold text-white leading-snug mb-2 ${isHero ? 'text-[22px] line-clamp-2' : 'text-[15px] line-clamp-2'}`}>
          {article.headline}
        </h2>

        {article.summary && (
          <p className={`text-[#AAAAAA] leading-snug ${isHero ? 'text-[14px] line-clamp-3' : 'text-[12px] line-clamp-2'}`}>
            {article.summary}
          </p>
        )}

        <div className={`flex items-center justify-between mt-auto pt-3 border-t border-[#1E2530] ${isHero ? 'mt-4' : 'mt-3'}`}>
          <span className="text-[11px] text-[#444D5A] truncate">
            {extractSourceName(article.source_name, article.source_url)} · {timeAgo(article.published_at)}
          </span>
        </div>
      </div>
    </article>
  )
}

function ActionButton({
  onClick, active, activeColor, label, children,
}: {
  onClick: () => void
  active: boolean
  activeColor: string
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      aria-label={label}
      className="w-8 h-8 rounded-full bg-[#0D1117]/80 backdrop-blur border border-[#1E2530] flex items-center justify-center hover:bg-[#161B22] transition-colors"
      style={{ color: active ? activeColor : '#888888' }}
    >
      {children}
    </button>
  )
}

// ── Mobile swipe card ────────────────────────────────────────────────────────

interface MobileSwipeCardProps {
  article: FeedArticle
  isSaved: boolean
  isLiked: boolean
  onLike: () => void
  onTap: () => void
  onSwipeLeft: () => void
  onSwipeRight: () => void
}

function MobileSwipeCard({ article, isSaved, isLiked, onLike, onTap, onSwipeLeft, onSwipeRight }: MobileSwipeCardProps) {
  const [exited, setExited] = useState<null | 'left' | 'right'>(null)
  const badgeClass = SEVERITY_BADGE[article.severity ?? 'low'] ?? SEVERITY_BADGE.low
  const cardRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef({ x: 0, y: 0 })

  const handleDragStart = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    dragStart.current = { x: info.point.x, y: info.point.y }
  }

  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100
    const dx = info.offset.x
    const dy = info.offset.y
    // Only treat as swipe if horizontal movement dominates
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
      if (dx > 0) { setExited('right'); setTimeout(onSwipeRight, 180) }
      else { setExited('left'); setTimeout(onSwipeLeft, 180) }
    }
  }

  return (
    <motion.div
      ref={cardRef}
      drag="x"
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      animate={
        exited === 'left'  ? { x: -500, opacity: 0 } :
        exited === 'right' ? { x:  500, opacity: 0 } :
                             { x: 0, opacity: 1 }
      }
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      className="snap-start shrink-0 w-full min-h-[calc(100dvh-56px)] px-4 py-3 flex"
    >
      <div
        onClick={onTap}
        className="relative w-full bg-[#161B22] rounded-2xl border border-[#1E2530] overflow-hidden flex flex-col cursor-pointer"
      >
        {article.featured_image && (
          <div className="w-full h-[200px] overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.featured_image}
              alt=""
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        <div className="flex-1 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeClass}`}>
              {article.severity ?? 'low'}
            </span>
            {article.content_type && (
              <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#1E2530] text-[#666]">
                {article.content_type.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          <h2 className="font-bold text-white text-[20px] leading-snug mb-3">
            {article.headline}
          </h2>

          {article.summary && (
            <p className="text-[#AAAAAA] text-[14px] leading-relaxed line-clamp-6 flex-1">
              {article.summary}
            </p>
          )}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#1E2530]">
            <span className="text-[12px] text-[#444D5A] truncate">
              {extractSourceName(article.source_name, article.source_url)} · {timeAgo(article.published_at)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onLike() }}
              aria-label={isLiked ? 'Unlike' : 'Like'}
              className="p-2 -mr-2"
              style={{ color: isLiked ? '#E84C4C' : '#666' }}
            >
              <Heart size={22} fill={isLiked ? '#E84C4C' : 'none'} />
            </button>
          </div>

          <div className="flex items-center justify-between mt-2 text-[11px] text-[#2C3444]">
            <span className="flex items-center gap-1">← skip</span>
            <span className="flex items-center gap-1">{isSaved ? 'saved' : 'save →'}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Feed Page ────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const { user, loading: sessionLoading } = useSession({ required: false })
  const router = useRouter()

  const isAnon = !sessionLoading && !user

  const [allCards, setAllCards]     = useState<FeedArticle[]>([])
  const [loading, setLoading]       = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore]       = useState(false)
  const [noPrefs, setNoPrefs]       = useState(false)
  const [savedIds, setSavedIds]     = useState<Set<string>>(new Set())
  const [likedIds, setLikedIds]     = useState<Set<string>>(new Set())
  const [toast, setToast]           = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [signUpPromptOpen, setSignUpPromptOpen] = useState(false)
  const [signUpReason, setSignUpReason] = useState<'save' | 'library' | 'notifications'>('save')
  const [signUpPromptArticle, setSignUpPromptArticle] = useState<string | undefined>(undefined)
  const toastTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const mobileSentinelRef = useRef<HTMLDivElement | null>(null)

  const currentSpaceId = user?.space_id ?? null

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  const buildFeedUrl = useCallback((offset: number): string => {
    if (user) return `/api/feed-algorithm?offset=${offset}`
    // Anonymous users get a general feed — no tag filtering
    const suppressed = getSuppressedIds().join(',')
    const params = new URLSearchParams({ offset: String(offset) })
    if (suppressed) params.set('suppressed', suppressed)
    return `/api/feed-algorithm?${params.toString()}`
  }, [user])

  const fetchFeed = useCallback(async () => {
    const url = buildFeedUrl(0)
    setLoading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Feed failed')
      const data = await res.json()
      if (data.message?.includes('preferences') || data.message?.includes('Complete')) {
        setNoPrefs(true); setAllCards([])
      } else {
        setNoPrefs(false)
        setAllCards(data.items ?? [])
        setHasMore(data.hasMore ?? false)
      }
    } catch (err) {
      console.error('[FeedPage]', err)
    } finally {
      setLoading(false)
    }
  }, [buildFeedUrl])

  useEffect(() => {
    if (sessionLoading) return
    fetchFeed()
  }, [sessionLoading, user, fetchFeed])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return
    const url = buildFeedUrl(allCards.length)
    setLoadingMore(true)
    try {
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      setAllCards(prev => [...prev, ...(data.items ?? [])])
      setHasMore(data.hasMore ?? false)
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore, loading, allCards.length, buildFeedUrl])

  useEffect(() => {
    const el = sentinelRef.current ?? mobileSentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore() },
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, allCards.length])

  const handleTap = useCallback((article: FeedArticle) => {
    router.push(`/feed/article/${article.id}`)
  }, [router])

  const handleLike = useCallback((article: FeedArticle) => {
    setLikedIds(prev => {
      const next = new Set(prev)
      if (next.has(article.id)) next.delete(article.id)
      else next.add(article.id)
      return next
    })
    if (!isAnon) {
      void fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_item_id: article.id, action: 'liked' }),
      })
    }
  }, [isAnon])

  const handleBookmark = useCallback((article: FeedArticle) => {
    if (isAnon) {
      addAnonSaveAttempt(article.id)
      setSignUpReason('save')
      setSignUpPromptArticle(article.headline)
      setSignUpPromptOpen(true)
      return
    }
    setSavedIds(prev => new Set(Array.from(prev).concat(article.id)))
    showToast('Saved to Library')
    void fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_item_id: article.id, action: 'saved' }),
    })
  }, [isAnon])

  const handleSwipeLeft = useCallback((article: FeedArticle) => {
    if (isAnon) {
      addAnonIgnored(article.id)
    } else {
      void fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_item_id: article.id, action: 'ignored' }),
      })
    }
    setAllCards(prev => prev.filter(a => a.id !== article.id))
    showToast('Skipped')
  }, [isAnon])

  const handleSwipeRight = useCallback((article: FeedArticle) => {
    handleBookmark(article)
  }, [handleBookmark])

  const handleDesktopIndustryPick = useCallback((spaceId: string) => {
    if (!user) return
    // Persist on users.space_id
    void fetch('/api/user/space', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: spaceId }),
    }).then(() => {
      router.push('/setup')
    }).catch(() => showToast('Could not update industry'))
  }, [user, router])

  const openSignupLocked = useCallback((reason: 'save' | 'library' | 'notifications' = 'library') => {
    setSignUpReason(reason)
    setSignUpPromptArticle(undefined)
    setSignUpPromptOpen(true)
  }, [])

  // Group desktop cards into hero+grid repeating blocks
  const desktopBlocks = useMemo(() => {
    const blocks: { hero: FeedArticle; grid: FeedArticle[] }[] = []
    for (let i = 0; i < allCards.length; i += 4) {
      const hero = allCards[i]
      const grid = allCards.slice(i + 1, i + 4)
      if (hero) blocks.push({ hero, grid })
    }
    return blocks
  }, [allCards])

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00C2A8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">

      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-[#0D1117] border-b border-[#1A2030] sticky top-0 z-40">
        <span className="text-white font-bold text-[17px] tracking-tight">Industry Intel</span>
        <button
          onClick={() => {
            if (isAnon) { openSignupLocked('library'); return }
            setPickerOpen(true)
          }}
          aria-label="Personalize"
          className="p-1.5 -mr-1.5 text-[#888888]"
        >
          <SlidersHorizontal size={22} />
        </button>
      </header>

      {/* ── 3-column layout (desktop) / stacked (mobile) ─────────────── */}
      <div className="md:flex md:items-start md:max-w-[1400px] md:mx-auto">
        <DesktopSidebar isAnon={isAnon} onLockedClick={() => openSignupLocked('library')} />

        {/* Main column */}
        <main className="flex-1 min-w-0">
          {/* Desktop centered app name banner */}
          <div className="hidden md:flex items-center justify-center h-16 border-b border-[#1A2030] sticky top-0 bg-[#0D1117]/95 backdrop-blur z-30">
            <span className="text-white font-bold text-[20px] tracking-tight">Industry Intel</span>
          </div>

          {/* Loading */}
          {loading && (
            <div className="px-4 md:px-8 pt-4 md:pt-8 space-y-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-[#161B22] rounded-2xl h-40 border border-[#1E2530] animate-pulse" />
              ))}
            </div>
          )}

          {/* No prefs */}
          {!loading && noPrefs && (
            <div className="flex flex-col items-center justify-center px-8 text-center pt-20">
              <h2 className="text-white font-bold text-[20px] mb-2">Personalise your feed</h2>
              <p className="text-[#444D5A] text-[14px] mb-6 max-w-sm">
                Select the topics you care about so we can curate the most relevant stories.
              </p>
              <Link href="/setup" className="bg-[#00C2A8] text-white font-semibold px-6 py-3 rounded-xl text-[15px]">
                Complete preferences
              </Link>
            </div>
          )}

          {/* Empty */}
          {!loading && !noPrefs && allCards.length === 0 && (
            <div className="flex flex-col items-center justify-center px-8 text-center pt-20">
              <h2 className="text-white font-bold text-[20px] mb-2">You are all caught up</h2>
              <p className="text-[#444D5A] text-[14px]">Check back later for new stories</p>
            </div>
          )}

          {/* ── Desktop feed: hero + 3-grid repeating ──────────────── */}
          {!loading && allCards.length > 0 && (
            <div className="hidden md:block px-8 py-8 space-y-8 max-w-[900px] mx-auto">
              {desktopBlocks.map((block, idx) => (
                <div key={idx} className="space-y-5">
                  <DesktopCard
                    article={block.hero}
                    variant="hero"
                    isSaved={savedIds.has(block.hero.id)}
                    isLiked={likedIds.has(block.hero.id)}
                    onLike={() => handleLike(block.hero)}
                    onBookmark={() => handleBookmark(block.hero)}
                    onTap={() => handleTap(block.hero)}
                  />
                  {block.grid.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {block.grid.map(a => (
                        <DesktopCard
                          key={a.id}
                          article={a}
                          variant="grid"
                          isSaved={savedIds.has(a.id)}
                          isLiked={likedIds.has(a.id)}
                          onLike={() => handleLike(a)}
                          onBookmark={() => handleBookmark(a)}
                          onTap={() => handleTap(a)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {hasMore && (
                <div ref={sentinelRef} className="py-6 flex justify-center">
                  {loadingMore && <div className="w-6 h-6 border-2 border-[#00C2A8] border-t-transparent rounded-full animate-spin" />}
                </div>
              )}
              {!hasMore && allCards.length > 0 && (
                <div className="py-6 text-center text-[12px] text-[#2C3240]">You have reached the end</div>
              )}
            </div>
          )}

          {/* ── Mobile feed: full-screen swipe cards ───────────────── */}
          {!loading && allCards.length > 0 && (
            <div className="md:hidden h-[calc(100dvh-56px)] overflow-y-auto snap-y snap-mandatory">
              {allCards.map(article => (
                <MobileSwipeCard
                  key={article.id}
                  article={article}
                  isSaved={savedIds.has(article.id)}
                  isLiked={likedIds.has(article.id)}
                  onLike={() => handleLike(article)}
                  onTap={() => handleTap(article)}
                  onSwipeLeft={() => handleSwipeLeft(article)}
                  onSwipeRight={() => handleSwipeRight(article)}
                />
              ))}
              {hasMore && (
                <div ref={mobileSentinelRef} className="py-6 flex justify-center">
                  {loadingMore && <div className="w-6 h-6 border-2 border-[#00C2A8] border-t-transparent rounded-full animate-spin" />}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right panel — anonymous users only (logged-in users manage preferences via Profile) */}
        {isAnon && (
          <PersonalizePanel
            isAnon
            currentSpaceId={currentSpaceId}
            onSelect={handleDesktopIndustryPick}
            onLockedClick={() => openSignupLocked('library')}
          />
        )}
      </div>

      {/* Mobile bottom nav — for logged-in users */}
      {!isAnon && <EndUserNav />}

      {/* First-time mobile overlay */}
      <MobileSwipeOverlay />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1E2530] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-xl border border-[#2C3444]">
          {toast}
        </div>
      )}

      {/* Anonymous + personalize modals */}
      {/* Picker only reachable by logged-in users (anon slider → signup prompt) */}
      <IndustryPickerModal
        open={pickerOpen}
        onSelect={(sid) => { handleDesktopIndustryPick(sid); setPickerOpen(false) }}
        onClose={() => setPickerOpen(false)}
        closable
      />

      <SignUpPromptModal
        open={signUpPromptOpen}
        onClose={() => setSignUpPromptOpen(false)}
        articleTitle={signUpPromptArticle}
        reason={signUpReason}
      />
    </div>
  )
}
