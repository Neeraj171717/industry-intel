'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { EndUserNav } from '@/components/layout/EndUserNav'
import { DesktopSidebar } from '@/components/feed/DesktopSidebar'

interface LibraryItem {
  id: string
  title: string
  summary: string
  featured_image: string | null
  severity: string | null
  content_type: string | null
  published_at: string
  thread_id: string | null
  interacted_at: string
  author_name: string | null
  source_name: string | null
  source_url: string | null
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

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-[#E84C4C]',
  high:     'bg-[#E8A84C]',
  medium:   'bg-[#00C2A8]',
  low:      'bg-[#555555]',
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-l-[#E84C4C]',
  high:     'border-l-[#E8A84C]',
  medium:   'border-l-[#00C2A8]',
  low:      'border-l-[#555555]',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

export default function LibraryPage() {
  const { user, loading: sessionLoading } = useSession({ required: true })
  const router = useRouter()

  const [items, setItems]     = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast]     = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const fetchLibrary = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const { data } = await supabase
        .from('user_interactions')
        .select(`
          interacted_at,
          final_item:final_items(
            id, title, summary, featured_image, severity, content_type, published_at, thread_id, source_name, source_url,
            author:users!final_items_author_id_fkey(name)
          )
        `)
        .eq('user_id', user.id)
        .eq('action', 'saved')
        .order('interacted_at', { ascending: false })

      const mapped: LibraryItem[] = (data ?? [])
        .filter((row: Record<string, unknown>) => row.final_item)
        .map((row: Record<string, unknown>) => {
          const fi = row.final_item as Record<string, unknown>
          const author = fi.author as { name: string } | null
          return {
            id:            fi.id as string,
            title:         fi.title as string,
            summary:       fi.summary as string,
            severity:      fi.severity as string | null,
            content_type:  fi.content_type as string | null,
            published_at:  fi.published_at as string,
            thread_id:     fi.thread_id as string | null,
            interacted_at: row.interacted_at as string,
            author_name:   author?.name ?? null,
            featured_image: fi.featured_image as string | null,
            source_name:   fi.source_name as string | null,
            source_url:    fi.source_url as string | null,
          }
        })

      setItems(mapped)
    } catch (err) {
      console.error('[LibraryPage]', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!sessionLoading && user) fetchLibrary()
  }, [sessionLoading, user, fetchLibrary])

  const handleRead = useCallback((item: LibraryItem) => {
    router.push(`/feed/article/${item.id}`)
  }, [router])

  const handleUnsave = useCallback(async (item: LibraryItem) => {
    // Optimistic remove
    setItems(prev => prev.filter(i => i.id !== item.id))
    showToast('Removed from Library')

    await fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_item_id: item.id, action: 'unsaved' }),
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0D1117]">
        <div className="md:flex md:items-start md:max-w-[1400px] md:mx-auto">
          <DesktopSidebar isAnon={false} />
          <main className="flex-1 min-w-0">
            <div className="px-4 md:px-8 pt-4 md:pt-8 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-[#161B22] rounded-xl p-4 border-l-4 border-[#1E2530] animate-pulse">
                  <div className="h-4 bg-[#1E2530] rounded w-3/4 mb-2" />
                  <div className="h-3 bg-[#1E2530] rounded w-1/2" />
                </div>
              ))}
            </div>
          </main>
        </div>
        <EndUserNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <div className="md:flex md:items-start md:max-w-[1400px] md:mx-auto">
        <DesktopSidebar isAnon={false} />

        <main className="flex-1 min-w-0">
          {/* Desktop header */}
          <div className="hidden md:flex items-center h-16 px-8 border-b border-[#1A2030] sticky top-0 bg-[#0D1117]/95 backdrop-blur z-30 gap-3">
            <h1 className="text-white font-bold text-[20px]">Library</h1>
            {items.length > 0 && (
              <span className="text-[13px] text-[#444D5A]">
                {items.length} saved {items.length === 1 ? 'article' : 'articles'}
              </span>
            )}
          </div>

          {/* Mobile header */}
          <header className="md:hidden flex items-center justify-between px-4 h-14 bg-[#0D1117] border-b border-[#1A2030] sticky top-0 z-40">
            <div>
              <h1 className="text-white font-bold text-[18px]">Library</h1>
              {items.length > 0 && (
                <p className="text-[11px] text-[#444D5A] -mt-0.5">
                  {items.length} saved {items.length === 1 ? 'article' : 'articles'}
                </p>
              )}
            </div>
          </header>

          <div className="pb-[72px] md:pb-10 max-w-[860px] md:mx-auto">

            {/* Empty state */}
            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
                <div className="w-16 h-16 bg-[#161B22] rounded-2xl flex items-center justify-center mb-5 border border-[#1E2530]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#444D5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h2 className="text-white font-bold text-[20px] mb-2">Nothing saved yet</h2>
                <p className="text-[#444D5A] text-[14px] leading-relaxed mb-6">
                  Bookmark articles from your feed to read them here later.
                </p>
                <button
                  onClick={() => router.push('/feed')}
                  className="bg-[#00C2A8] text-white font-semibold px-6 py-3 rounded-xl text-[15px]"
                >
                  Back to Feed
                </button>
              </div>
            )}

            {/* Library list */}
            {items.length > 0 && (
              <div className="px-4 md:px-8 pt-3 md:pt-6 space-y-2.5">
                {items.map(item => {
                  const dotClass    = SEVERITY_DOT[item.severity ?? 'low'] ?? SEVERITY_DOT.low
                  const borderClass = SEVERITY_BORDER[item.severity ?? 'low'] ?? SEVERITY_BORDER.low
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleRead(item)}
                      className={`w-full text-left bg-[#161B22] rounded-xl overflow-hidden border-l-4 ${borderClass} border border-[#1E2530] hover:border-[#2C3444] transition-colors`}
                    >
                      {item.featured_image && (
                        <div className="w-full h-[100px] md:h-[140px] overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.featured_image}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        </div>
                      )}

                      <div className="flex items-start gap-3 p-4">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotClass}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] md:text-[16px] font-semibold text-white leading-snug line-clamp-2 mb-1">
                            {item.title}
                          </p>
                          <div className="flex items-center gap-2 text-[12px] text-[#444D5A]">
                            <span>{extractSourceName(item.source_name, item.source_url)}</span>
                            <span>·</span>
                            <span>Saved {timeAgo(item.interacted_at)}</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); void handleUnsave(item) }}
                          className="p-1 shrink-0 touch-manipulation"
                          aria-label="Remove from library"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="#00C2A8" stroke="#00C2A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                          </svg>
                        </button>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      <EndUserNav />

      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1E2530] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-xl border border-[#2C3444]">
          {toast}
        </div>
      )}
    </div>
  )
}
