'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { EndUserNav } from '@/components/layout/EndUserNav'
import { DesktopSidebar } from '@/components/feed/DesktopSidebar'

interface ActivityStats {
  read:   number
  saved:  number
  topics: number
  liked:  number
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

function formatMemberSince(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function ActivityPage() {
  const { user, loading: sessionLoading } = useSession({ required: true })
  const router = useRouter()

  const [stats, setStats]         = useState<ActivityStats>({ read: 0, saved: 0, topics: 0, liked: 0 })
  const [spaceNames, setSpaceNames] = useState<string[]>([])

  useEffect(() => {
    if (!user) return
    const supabase = createBrowserSupabaseClient()

    // Interactions: read, saved, liked counts
    supabase
      .from('user_interactions')
      .select('action')
      .eq('user_id', user.id)
      .in('action', ['read', 'saved', 'liked'])
      .then(({ data }: { data: Array<{ action: string }> | null }) => {
        const rows = data ?? []
        setStats(prev => ({
          ...prev,
          read:  rows.filter(r => r.action === 'read').length,
          saved: rows.filter(r => r.action === 'saved').length,
          liked: rows.filter(r => r.action === 'liked').length,
        }))
      })

    // Topic count + selected space IDs
    supabase
      .from('user_preferences')
      .select('followed_tag_ids, space_ids')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(async ({ data }: { data: { followed_tag_ids: string[]; space_ids: string[] } | null }) => {
        const topics   = (data?.followed_tag_ids ?? []).length
        const spaceIds: string[] =
          (data?.space_ids && data.space_ids.length > 0)
            ? data.space_ids
            : user!.space_id ? [user!.space_id] : []

        setStats(prev => ({ ...prev, topics }))

        if (spaceIds.length > 0) {
          // Fetch names for all selected spaces via the public admin route
          const res  = await fetch('/api/public-spaces').then(r => r.json())
          const all: Array<{ id: string; name: string }> = res.spaces ?? []
          const names = spaceIds.map(id => all.find(s => s.id === id)?.name).filter(Boolean) as string[]
          setSpaceNames(names)
        }
      })
  }, [user])

  if (sessionLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00C2A8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const STAT_ITEMS = [
    { emoji: '📖', label: 'Read',   value: stats.read  },
    { emoji: '🔖', label: 'Saved',  value: stats.saved  },
    { emoji: '🏷️', label: 'Topics', value: stats.topics },
    { emoji: '❤️', label: 'Liked',  value: stats.liked  },
  ]

  const dashboardContent = (
    <div className="pb-[72px] md:pb-10 max-w-[560px] md:mx-auto">

      {/* ── Identity card ───────────────────────────────────────────── */}
      <div className="mx-4 mt-6 bg-[#161B22] rounded-2xl border border-[#1E2530] p-5">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="w-[64px] h-[64px] shrink-0 rounded-full bg-[#00C2A8] flex items-center justify-center">
            <span className="text-white font-bold text-[22px]">{initials(user.name)}</span>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold text-[18px] truncate">{user.name}</p>

            {spaceNames.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {spaceNames.map(name => (
                  <span
                    key={name}
                    className="text-[12px] font-medium px-2.5 py-0.5 bg-[#00C2A8]/10 text-[#00C2A8] border border-[#00C2A8]/20 rounded-full"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#444D5A] mt-1">No industry selected</p>
            )}

            <p className="text-[12px] text-[#444D5A] mt-1.5">
              Member since {formatMemberSince(user.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────── */}
      <div className="mx-4 mt-4 bg-[#161B22] rounded-2xl border border-[#1E2530]">
        <div className="grid grid-cols-4">
          {STAT_ITEMS.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center py-5 ${i > 0 ? 'border-l border-[#1E2530]' : ''}`}
            >
              <span className="text-[18px] mb-1">{stat.emoji}</span>
              <span className="text-white font-bold text-[20px] leading-none">{stat.value}</span>
              <span className="text-[11px] text-[#444D5A] mt-1">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-[11px] text-[#2C3444] mt-8">Version 1.0.0</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <div className="md:flex md:items-start md:max-w-[1400px] md:mx-auto">
        <DesktopSidebar isAnon={false} />

        <main className="flex-1 min-w-0">
          {/* Desktop header */}
          <div className="hidden md:flex items-center h-16 px-8 border-b border-[#1A2030] sticky top-0 bg-[#0D1117]/95 backdrop-blur z-30">
            <h1 className="text-white font-bold text-[20px]">Your Activity</h1>
          </div>

          {/* Mobile header */}
          <header className="md:hidden flex items-center px-4 h-14 bg-[#0D1117] border-b border-[#1A2030] sticky top-0 z-40">
            <button onClick={() => router.back()} className="p-1.5 -ml-1.5 text-[#888888] mr-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h1 className="text-white font-bold text-[18px]">Your Activity</h1>
          </header>

          {dashboardContent}
        </main>
      </div>

      <EndUserNav />
    </div>
  )
}
