'use client'

import { useEffect, useState } from 'react'
import { Sparkles, ChevronRight, Pencil } from 'lucide-react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase'

interface Space {
  id: string
  name: string
  description: string | null
}

interface Props {
  isAnon: boolean
  currentSpaceId: string | null
  userId?: string
  onSelect: (spaceId: string) => void
  onLockedClick: () => void
}

// ── Logged-in: "Your Preferences" panel ──────────────────────────────────────

function UserPreferencesPanel({ spaceId, userId }: { spaceId: string | null; userId: string }) {
  const [industryName, setIndustryName]   = useState<string | null>(null)
  const [tagNames, setTagNames]           = useState<string[]>([])
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    if (!userId) return
    const supabase = createBrowserSupabaseClient()
    let cancelled = false

    async function load() {
      const [prefsResult, spaceResult] = await Promise.all([
        supabase
          .from('user_preferences')
          .select('followed_tag_ids')
          .eq('user_id', userId!)
          .maybeSingle(),
        spaceId
          ? supabase
              .from('industry_spaces')
              .select('name')
              .eq('id', spaceId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      if (cancelled) return

      const ids: string[] = (prefsResult.data as { followed_tag_ids: string[] } | null)?.followed_tag_ids ?? []
      if (ids.length > 0) {
        const { data: tagRows } = await supabase.from('tags').select('name').in('id', ids)
        if (!cancelled) setTagNames((tagRows as { name: string }[] | null ?? []).map(t => t.name))
      } else {
        setTagNames([])
      }

      setIndustryName((spaceResult.data as { name: string } | null)?.name ?? null)
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [userId, spaceId])

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-4 bg-[#0D1117] rounded w-2/3 animate-pulse" />
        <div className="flex flex-wrap gap-1.5 mt-3">
          {[0, 1, 2].map(i => <div key={i} className="h-6 w-16 bg-[#0D1117] rounded-full animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      {industryName ? (
        <div className="mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#444D5A] mb-1">Industry</p>
          <p className="text-[14px] font-semibold text-white">{industryName}</p>
        </div>
      ) : (
        <p className="text-[13px] text-[#555E6E] mb-3">No industry selected yet.</p>
      )}

      {tagNames.length > 0 ? (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#444D5A] mb-2">Topics</p>
          <div className="flex flex-wrap gap-1.5">
            {tagNames.slice(0, 8).map(name => (
              <span
                key={name}
                className="px-2.5 py-1 rounded-full bg-[#00C2A8]/10 text-[#00C2A8] border border-[#00C2A8]/20 text-[11px] font-medium"
              >
                {name}
              </span>
            ))}
            {tagNames.length > 8 && (
              <span className="px-2.5 py-1 rounded-full bg-[#1E2530] text-[#666] text-[11px]">
                +{tagNames.length - 8} more
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-[#555E6E]">No topics selected yet.</p>
      )}

      <Link
        href="/preferences"
        className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-[#2C3444] text-[#888888] hover:border-[#00C2A8] hover:text-[#00C2A8] text-[13px] font-medium transition-colors"
      >
        <Pencil size={13} />
        Edit Preferences
      </Link>
    </div>
  )
}

// ── Anonymous: industry list panel ────────────────────────────────────────────

function AnonIndustryPanel({
  currentSpaceId,
  onLockedClick,
}: {
  currentSpaceId: string | null
  onSelect?: (spaceId: string) => void
  onLockedClick: () => void
}) {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/public-spaces')
      .then(r => r.json())
      .then(data => { setSpaces(data.spaces ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-11 bg-[#0D1117] rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <ul className="space-y-1.5">
      {spaces.map(s => {
        const active = s.id === currentSpaceId
        return (
          <li key={s.id}>
            <button
              onClick={() => onLockedClick()}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] flex items-center justify-between group transition-colors ${
                active
                  ? 'bg-[#00C2A8]/10 text-[#00C2A8] border border-[#00C2A8]/30'
                  : 'text-[#AAAAAA] hover:bg-[#0D1117] border border-transparent'
              }`}
            >
              <span className="truncate font-medium">{s.name}</span>
              <ChevronRight size={14} className="text-[#444D5A] group-hover:text-[#00C2A8] shrink-0 ml-2" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function PersonalizePanel({ isAnon, currentSpaceId, userId, onSelect, onLockedClick }: Props) {
  return (
    <aside className="hidden lg:block w-[300px] shrink-0 sticky top-0 h-screen px-4 py-6 overflow-y-auto">
      <div className="bg-[#161B22] border border-[#1E2530] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={15} className="text-[#00C2A8]" />
          <h3 className="text-white font-semibold text-[14px]">
            {isAnon ? 'Personalize your feed' : 'Your Preferences'}
          </h3>
        </div>

        {isAnon ? (
          <>
            <p className="text-[12px] text-[#555E6E] mb-4">Sign in to follow an industry and get a tailored feed.</p>
            <AnonIndustryPanel
              currentSpaceId={currentSpaceId}
              onSelect={onSelect}
              onLockedClick={onLockedClick}
            />
          </>
        ) : (
          <UserPreferencesPanel spaceId={currentSpaceId} userId={userId!} />
        )}
      </div>
    </aside>
  )
}
