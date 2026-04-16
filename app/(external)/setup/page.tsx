'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useAppStore } from '@/store'
import { DesktopSidebar } from '@/components/feed/DesktopSidebar'
import type { User } from '@/types'

interface Industry { id: string; name: string; description: string | null }
interface Tag      { id: string; name: string }

type ReadingFormat  = 'quick_cards' | 'short_brief' | 'deep_read'
type AlertIntensity = 'low' | 'medium' | 'high'

const TOTAL_STEPS        = 4
const MAX_INDUSTRIES     = 2
const MAX_TAGS_PER_INDUSTRY = 3

const FORMAT_OPTIONS: { value: ReadingFormat; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'quick_cards',
    label: 'Quick Cards',
    desc:  'Fast swipeable summaries — perfect for daily catch-up in under 5 minutes',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    value: 'short_brief',
    label: 'Short Brief',
    desc:  'A bit more context with each story — ideal for staying informed on the go',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    value: 'deep_read',
    label: 'Deep Read',
    desc:  'Full articles with complete context — for when you have time to go deep',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
]

const ALERT_OPTIONS: { value: AlertIntensity; label: string; desc: string }[] = [
  { value: 'low',    label: 'Low',    desc: 'Weekly digest — minimal interruptions' },
  { value: 'medium', label: 'Medium', desc: 'Daily summary — stay informed without overload' },
  { value: 'high',   label: 'High',   desc: 'As they come — immediate alerts for everything' },
]

export default function SetupPage() {
  const { user, loading: sessionLoading } = useSession({ required: true })
  const { setCurrentUser } = useAppStore()
  const router = useRouter()

  const [step, setStep]           = useState(1)
  const [industries, setIndustries] = useState<Industry[]>([])
  const [industryLoading, setIndustryLoading] = useState(true)

  // ── Multi-industry state (same model as /preferences) ──────────────────────
  // Up to MAX_INDUSTRIES selected (ordered — first = primary)
  const [selectedIndustryIds, setSelectedIndustryIds] = useState<string[]>([])
  // Available tags per industry keyed by space_id
  const [industryTags, setIndustryTags] = useState<Record<string, Tag[]>>({})
  // Selected tag IDs per industry (max MAX_TAGS_PER_INDUSTRY each)
  const [selectedTagsByIndustry, setSelectedTagsByIndustry] = useState<Record<string, string[]>>({})

  const [format, setFormat]         = useState<ReadingFormat>('quick_cards')
  const [intensity, setIntensity]   = useState<AlertIntensity>('medium')
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const tagsLoadingRef              = useRef<Record<string, boolean>>({})
  const [tagsLoadingIds, setTagsLoadingIds] = useState<string[]>([])

  // Redirect if preferences already exist
  useEffect(() => {
    if (!user) return
    createBrowserSupabaseClient()
      .from('user_preferences')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => {
        if (data) router.replace('/feed')
      })
  }, [user, router])

  // Load all industries via admin API (bypasses RLS + PostgREST filter bug)
  useEffect(() => {
    if (!user) return
    fetch('/api/public-spaces')
      .then(r => r.json())
      .then((res: { spaces: Industry[] }) => {
        setIndustries(res.spaces ?? [])
        setIndustryLoading(false)
      })
      .catch(() => setIndustryLoading(false))
  }, [user])

  // Load tags for a given industry (called when user selects it)
  const loadTagsFor = useCallback(async (spaceId: string) => {
    if (tagsLoadingRef.current[spaceId] || industryTags[spaceId]) return
    tagsLoadingRef.current[spaceId] = true
    setTagsLoadingIds(prev => [...prev, spaceId])
    try {
      const res  = await fetch(`/api/public-tags?space_id=${spaceId}`).then(r => r.json())
      const tags: Tag[] = res.tags ?? []
      setIndustryTags(prev => ({ ...prev, [spaceId]: tags }))
      setSelectedTagsByIndustry(prev => ({ ...prev, [spaceId]: prev[spaceId] ?? [] }))
    } finally {
      tagsLoadingRef.current[spaceId] = false
      setTagsLoadingIds(prev => prev.filter(id => id !== spaceId))
    }
  }, [industryTags])

  // Toggle an industry on / off (max MAX_INDUSTRIES)
  const toggleIndustry = useCallback(async (id: string) => {
    const isSelected = selectedIndustryIds.includes(id)
    if (isSelected) {
      setSelectedIndustryIds(prev => prev.filter(x => x !== id))
      setSelectedTagsByIndustry(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } else {
      if (selectedIndustryIds.length >= MAX_INDUSTRIES) return
      setSelectedIndustryIds(prev => [...prev, id])
      await loadTagsFor(id)
    }
  }, [selectedIndustryIds, loadTagsFor])

  // Toggle a tag within an industry (max MAX_TAGS_PER_INDUSTRY)
  const toggleTag = useCallback((spaceId: string, tagId: string) => {
    setSelectedTagsByIndustry(prev => {
      const current = prev[spaceId] ?? []
      if (current.includes(tagId)) {
        return { ...prev, [spaceId]: current.filter(x => x !== tagId) }
      }
      if (current.length >= MAX_TAGS_PER_INDUSTRY) return prev
      return { ...prev, [spaceId]: [...current, tagId] }
    })
  }, [])

  // When advancing to step 2, pre-load tags for all selected industries
  const goToStep2 = useCallback(async () => {
    setStep(2)
    await Promise.all(selectedIndustryIds.map(loadTagsFor))
  }, [selectedIndustryIds, loadTagsFor])

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleComplete = useCallback(async () => {
    if (!user || selectedIndustryIds.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const supabase       = createBrowserSupabaseClient()
      const primarySpaceId = selectedIndustryIds[0]
      const followedTagIds = Object.values(selectedTagsByIndustry).flat()

      // Update user's primary space
      if (user.space_id !== primarySpaceId) {
        const { error } = await supabase
          .from('users')
          .update({ space_id: primarySpaceId, updated_at: new Date().toISOString() })
          .eq('id', user.id)
        if (error) throw error
        setCurrentUser({ ...user, space_id: primarySpaceId } as User)
      }

      // Insert preferences with multi-industry support
      const { error: prefErr } = await supabase
        .from('user_preferences')
        .insert({
          user_id:          user.id,
          space_id:         primarySpaceId,
          space_ids:        selectedIndustryIds,
          followed_tag_ids: followedTagIds,
          reading_format:   format,
          alert_intensity:  intensity,
          updated_at:       new Date().toISOString(),
        })
      if (prefErr) throw prefErr

      // Seed default tag weights
      if (followedTagIds.length > 0) {
        await supabase.from('user_tag_weights').insert(
          followedTagIds.map(tag_id => ({
            user_id: user.id, tag_id, weight: 0.5, interaction_count: 0,
            updated_at: new Date().toISOString(),
          }))
        )
      }

      router.push('/feed')
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Could not save preferences')
    } finally {
      setSaving(false)
    }
  }, [user, selectedIndustryIds, selectedTagsByIndustry, format, intensity, router, setCurrentUser])

  // ── Gate checks ───────────────────────────────────────────────────────────
  const canAdvanceFromStep1 = selectedIndustryIds.length >= 1
  const totalTagsSelected   = Object.values(selectedTagsByIndustry).reduce((s, t) => s + t.length, 0)
  const canAdvanceFromStep2 = totalTagsSelected > 0

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00C2A8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Step content ──────────────────────────────────────────────────────────
  const stepContent = (
    <div className="flex-1 overflow-y-auto px-5 py-6 pb-36">
      <p className="text-[12px] text-[#444D5A] font-medium mb-1">Step {step} of {TOTAL_STEPS}</p>

      {/* ── Step 1: Industry (multi-select, max 2) ─────────────────────── */}
      {step === 1 && (
        <>
          <h1 className="text-white font-bold text-[26px] mb-1">
            Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[#444D5A] text-[15px]">Select up to {MAX_INDUSTRIES} industries to follow.</p>
            <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${
              selectedIndustryIds.length >= MAX_INDUSTRIES
                ? 'bg-[#00C2A8]/15 text-[#00C2A8]'
                : 'bg-[#1E2530] text-[#444D5A]'
            }`}>
              {selectedIndustryIds.length}/{MAX_INDUSTRIES}
            </span>
          </div>

          {industryLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-16 bg-[#161B22] rounded-2xl animate-pulse" />)}
            </div>
          ) : industries.length === 0 ? (
            <div className="bg-[#161B22] border border-[#1E2530] rounded-xl p-5 text-center">
              <p className="text-[#444D5A] text-[14px]">No industries available yet.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {industries.map(ind => {
                const isSelected = selectedIndustryIds.includes(ind.id)
                const atMax      = !isSelected && selectedIndustryIds.length >= MAX_INDUSTRIES
                return (
                  <button
                    key={ind.id}
                    onClick={() => toggleIndustry(ind.id)}
                    disabled={atMax}
                    className={`w-full text-left bg-[#161B22] rounded-2xl p-4 border-2 transition-all ${
                      isSelected
                        ? 'border-[#00C2A8]'
                        : atMax
                        ? 'border-[#1E2530] opacity-40 cursor-not-allowed'
                        : 'border-[#1E2530] hover:border-[#2C3444]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className={`font-semibold text-[16px] mb-0.5 ${isSelected ? 'text-[#00C2A8]' : 'text-white'}`}>
                          {ind.name}
                        </p>
                        {ind.description && (
                          <p className="text-[13px] text-[#555E6E] leading-relaxed">{ind.description}</p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="ml-3 shrink-0 w-5 h-5 rounded-full bg-[#00C2A8] flex items-center justify-center">
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {selectedIndustryIds.length >= MAX_INDUSTRIES && (
            <p className="text-[12px] text-[#444D5A] mt-4 text-center">
              Maximum {MAX_INDUSTRIES} industries selected. Deselect one to choose another.
            </p>
          )}
        </>
      )}

      {/* ── Step 2: Topics per industry (max 3 each) ───────────────────── */}
      {step === 2 && (
        <>
          <h1 className="text-white font-bold text-[26px] mb-1">Pick your topics</h1>
          <p className="text-[#444D5A] text-[15px] mb-5">
            Select up to {MAX_TAGS_PER_INDUSTRY} topics from each industry.
          </p>

          <div className="space-y-6">
            {selectedIndustryIds.map(spaceId => {
              const ind      = industries.find(i => i.id === spaceId)
              const tags     = industryTags[spaceId]
              const selected = selectedTagsByIndustry[spaceId] ?? []
              const isLoading = tagsLoadingIds.includes(spaceId)
              const atTagMax  = selected.length >= MAX_TAGS_PER_INDUSTRY

              return (
                <div key={spaceId}>
                  {/* Industry sub-header */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-white font-semibold text-[15px]">{ind?.name}</p>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      atTagMax
                        ? 'bg-[#00C2A8]/15 text-[#00C2A8]'
                        : 'bg-[#1E2530] text-[#444D5A]'
                    }`}>
                      {selected.length}/{MAX_TAGS_PER_INDUSTRY}
                    </span>
                  </div>

                  {isLoading ? (
                    <div className="flex flex-wrap gap-2">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-9 w-24 bg-[#161B22] rounded-full animate-pulse" />
                      ))}
                    </div>
                  ) : !tags || tags.length === 0 ? (
                    <p className="text-[13px] text-[#444D5A]">No topics available for this industry.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tags.map(tag => {
                        const isSel    = selected.includes(tag.id)
                        const disabled = !isSel && atTagMax
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(spaceId, tag.id)}
                            disabled={disabled}
                            className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                              isSel
                                ? 'bg-[#00C2A8] border-[#00C2A8] text-white'
                                : disabled
                                ? 'bg-transparent border-[#1E2530] text-[#333D4D] cursor-not-allowed'
                                : 'bg-transparent border-[#2C3444] text-[#888888] hover:border-[#444D5A]'
                            }`}
                          >
                            {tag.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {totalTagsSelected === 0 && (
            <p className="text-[12px] text-[#E8A84C] mt-5">Select at least one topic to continue.</p>
          )}
        </>
      )}

      {/* ── Step 3: Reading Format ─────────────────────────────────────── */}
      {step === 3 && (
        <>
          <h1 className="text-white font-bold text-[26px] mb-1">Reading format</h1>
          <p className="text-[#444D5A] text-[15px] mb-5">How would you like to read your stories?</p>
          <div className="space-y-3">
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={`w-full text-left bg-[#161B22] rounded-2xl p-4 border-2 transition-all ${
                  format === opt.value ? 'border-[#00C2A8]' : 'border-[#1E2530] hover:border-[#2C3444]'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 ${format === opt.value ? 'text-[#00C2A8]' : 'text-[#444D5A]'}`}>{opt.icon}</div>
                  <div>
                    <p className={`font-semibold text-[16px] mb-1 ${format === opt.value ? 'text-[#00C2A8]' : 'text-white'}`}>{opt.label}</p>
                    <p className="text-[13px] text-[#555E6E] leading-relaxed">{opt.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Step 4: Alert Intensity ────────────────────────────────────── */}
      {step === 4 && (
        <>
          <h1 className="text-white font-bold text-[26px] mb-1">Alert intensity</h1>
          <p className="text-[#444D5A] text-[15px] mb-5">How often do you want to be notified?</p>
          <div className="space-y-3">
            {ALERT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setIntensity(opt.value)}
                className={`w-full text-left bg-[#161B22] rounded-2xl p-4 border-2 transition-all ${
                  intensity === opt.value ? 'border-[#00C2A8]' : 'border-[#1E2530] hover:border-[#2C3444]'
                }`}
              >
                <p className={`font-semibold text-[16px] mb-0.5 ${intensity === opt.value ? 'text-[#00C2A8]' : 'text-white'}`}>{opt.label}</p>
                <p className="text-[13px] text-[#555E6E]">{opt.desc}</p>
              </button>
            ))}
          </div>
          {saveError && (
            <div className="mt-4 bg-[#E84C4C]/10 border border-[#E84C4C]/30 rounded-xl px-4 py-3">
              <p className="text-[#E84C4C] text-[13px]">{saveError}</p>
            </div>
          )}
        </>
      )}
    </div>
  )

  // ── Bottom CTA (sidebar-aware on desktop) ─────────────────────────────────
  const bottomCta = (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-5 py-4 bg-[#0D1117]/95 backdrop-blur border-t border-[#1A2030]">
      <div className="max-w-[500px] mx-auto md:ml-[calc(240px+2rem)]">
        {step < TOTAL_STEPS ? (
          <div className="flex gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex-1 py-3.5 rounded-xl border border-[#1E2530] text-[#888888] font-semibold text-[15px]"
              >
                Back
              </button>
            )}
            <button
              onClick={step === 1 ? goToStep2 : () => setStep(s => s + 1)}
              disabled={(step === 1 && !canAdvanceFromStep1) || (step === 2 && !canAdvanceFromStep2)}
              className={`flex-1 py-3.5 rounded-xl font-semibold text-[15px] transition-all ${
                (step === 1 && !canAdvanceFromStep1) || (step === 2 && !canAdvanceFromStep2)
                  ? 'bg-[#1A2030] text-[#444D5A] cursor-not-allowed'
                  : 'bg-[#00C2A8] text-white'
              }`}
            >
              Next
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-3.5 rounded-xl border border-[#1E2530] text-[#888888] font-semibold text-[15px]"
            >
              Back
            </button>
            <button
              onClick={handleComplete}
              disabled={saving}
              className="flex-1 py-3.5 rounded-xl bg-[#00C2A8] text-white font-semibold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving
                ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</>
                : 'Take me to my feed'}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0D1117]">
      {/* Progress bar */}
      <div className="h-1 bg-[#161B22]">
        <div className="h-full bg-[#00C2A8] transition-all duration-500" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
      </div>

      <div className="md:flex md:items-start md:max-w-[1400px] md:mx-auto">
        <DesktopSidebar isAnon={false} />

        <main className="flex-1 min-w-0 flex flex-col">
          {/* Desktop header */}
          <div className="hidden md:flex items-center justify-between h-16 px-8 border-b border-[#1A2030] sticky top-0 bg-[#0D1117]/95 backdrop-blur z-30">
            <div>
              <h1 className="text-white font-bold text-[20px]">Set up your feed</h1>
              <p className="text-[#444D5A] text-[12px]">Step {step} of {TOTAL_STEPS}</p>
            </div>
          </div>

          <div className="max-w-[500px] w-full md:mx-8">
            {stepContent}
          </div>
        </main>
      </div>

      {bottomCta}
    </div>
  )
}
