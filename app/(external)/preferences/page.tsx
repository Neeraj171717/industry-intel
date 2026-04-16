'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { DesktopSidebar } from '@/components/feed/DesktopSidebar'

interface Tag { id: string; name: string }
interface Industry { id: string; name: string; description: string | null }

type ReadingFormat  = 'quick_cards' | 'short_brief' | 'deep_read'
type AlertIntensity = 'low' | 'medium' | 'high'

const MAX_INDUSTRIES = 2
const MAX_TAGS_PER_INDUSTRY = 3

const FORMAT_OPTIONS: { value: ReadingFormat; label: string; desc: string }[] = [
  { value: 'quick_cards', label: 'Quick Cards', desc: 'Fast swipeable summaries — under 5 minutes' },
  { value: 'short_brief', label: 'Short Brief', desc: 'A bit more context with each story' },
  { value: 'deep_read',   label: 'Deep Read',   desc: 'Full articles with complete context' },
]

const ALERT_OPTIONS: { value: AlertIntensity; label: string; desc: string }[] = [
  { value: 'low',    label: 'Low',    desc: 'Weekly digest — minimal interruptions' },
  { value: 'medium', label: 'Medium', desc: 'Daily summary' },
  { value: 'high',   label: 'High',   desc: 'As they come — immediate alerts' },
]

export default function PreferencesPage() {
  const { user, loading: sessionLoading } = useSession({ required: true })
  const router = useRouter()

  const [industries, setIndustries]         = useState<Industry[]>([])
  // Up to 2 selected industry IDs (ordered — first = primary)
  const [selectedIndustryIds, setSelectedIndustryIds] = useState<string[]>([])
  // Available tags per industry, keyed by space_id
  const [industryTags, setIndustryTags]     = useState<Record<string, Tag[]>>({})
  // Selected tag IDs per industry (max 3 each), keyed by space_id
  const [selectedTagsByIndustry, setSelectedTagsByIndustry] = useState<Record<string, string[]>>({})

  const [format, setFormat]               = useState<ReadingFormat>('quick_cards')
  const [intensity, setIntensity]         = useState<AlertIntensity>('medium')
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [saveSuccess, setSaveSuccess]     = useState(false)
  const [saveError, setSaveError]         = useState<string | null>(null)
  const [isDirty, setIsDirty]             = useState(false)

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const supabase = createBrowserSupabaseClient()

    async function load() {
      const [spacesRes, prefsResult] = await Promise.all([
        fetch('/api/public-spaces').then(r => r.json()),
        supabase
          .from('user_preferences')
          .select('space_ids, followed_tag_ids, reading_format, alert_intensity')
          .eq('user_id', user!.id)
          .maybeSingle(),
      ])

      setIndustries(spacesRes.spaces ?? [])

      const prefs = prefsResult.data
      if (prefs) {
        setFormat((prefs.reading_format as ReadingFormat) ?? 'quick_cards')
        setIntensity((prefs.alert_intensity as AlertIntensity) ?? 'medium')
      }

      // Resolve selected industries: prefer space_ids array, fall back to legacy space_id
      const spaceIds: string[] =
        (prefs?.space_ids && prefs.space_ids.length > 0)
          ? prefs.space_ids
          : user!.space_id ? [user!.space_id] : []

      setSelectedIndustryIds(spaceIds)

      // Load tags for all selected industries in parallel
      if (spaceIds.length > 0) {
        const followedFlat: string[] = prefs?.followed_tag_ids ?? []

        const tagsResults = await Promise.all(
          spaceIds.map(id => fetch(`/api/public-tags?space_id=${id}`).then(r => r.json()))
        )

        const tagsMap: Record<string, Tag[]>   = {}
        const selectedMap: Record<string, string[]> = {}

        spaceIds.forEach((id, i) => {
          const available: Tag[] = tagsResults[i].tags ?? []
          tagsMap[id]     = available
          selectedMap[id] = available.map(t => t.id).filter(tid => followedFlat.includes(tid))
        })

        setIndustryTags(tagsMap)
        setSelectedTagsByIndustry(selectedMap)
      }

      setLoading(false)
    }

    void load()
  }, [user])

  // ── Toggle industry selection (max 2) ──────────────────────────────────────
  const toggleIndustry = useCallback(async (industryId: string) => {
    const isSelected = selectedIndustryIds.includes(industryId)

    if (isSelected) {
      // Deselect — clear its tags too
      setSelectedIndustryIds(prev => prev.filter(id => id !== industryId))
      setSelectedTagsByIndustry(prev => {
        const next = { ...prev }
        delete next[industryId]
        return next
      })
      setIsDirty(true)
      return
    }

    if (selectedIndustryIds.length >= MAX_INDUSTRIES) return // already at max

    setSelectedIndustryIds(prev => [...prev, industryId])
    setIsDirty(true)

    // Load tags if not already cached
    if (!industryTags[industryId]) {
      const res = await fetch(`/api/public-tags?space_id=${industryId}`).then(r => r.json())
      setIndustryTags(prev => ({ ...prev, [industryId]: res.tags ?? [] }))
      setSelectedTagsByIndustry(prev => ({ ...prev, [industryId]: [] }))
    }
  }, [selectedIndustryIds, industryTags])

  // ── Toggle tag within an industry (max 3 per industry) ────────────────────
  const toggleTag = useCallback((industryId: string, tagId: string) => {
    setSelectedTagsByIndustry(prev => {
      const current = prev[industryId] ?? []
      if (current.includes(tagId)) {
        return { ...prev, [industryId]: current.filter(id => id !== tagId) }
      }
      if (current.length >= MAX_TAGS_PER_INDUSTRY) return prev // at max
      return { ...prev, [industryId]: [...current, tagId] }
    })
    setIsDirty(true)
  }, [])

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!user || selectedIndustryIds.length === 0) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const primarySpaceId = selectedIndustryIds[0]
      const followedTagIds = Object.values(selectedTagsByIndustry).flat()

      // Update users.space_id to the primary industry
      if (user.space_id !== primarySpaceId) {
        const res = await fetch('/api/user/space', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ space_id: primarySpaceId }),
        })
        if (!res.ok) throw new Error('Could not update industry')
      }

      const supabase = createBrowserSupabaseClient()
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id:          user.id,
            space_id:         primarySpaceId,
            space_ids:        selectedIndustryIds,
            followed_tag_ids: followedTagIds,
            reading_format:   format,
            alert_intensity:  intensity,
            updated_at:       new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )

      if (error) throw error

      setSaveSuccess(true)
      setIsDirty(false)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Could not save preferences')
    } finally {
      setSaving(false)
    }
  }, [user, selectedIndustryIds, selectedTagsByIndustry, format, intensity])

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0D1117]">
        <div className="md:flex md:items-start md:max-w-[1400px] md:mx-auto">
          <DesktopSidebar isAnon={false} />
          <main className="flex-1 min-w-0 px-4 md:px-8 pt-8 space-y-4 animate-pulse">
            <div className="h-5 w-32 bg-[#161B22] rounded" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-[#161B22] rounded-xl" />)}
            </div>
          </main>
        </div>
      </div>
    )
  }

  const totalTagsSelected = Object.values(selectedTagsByIndustry).reduce((s, t) => s + t.length, 0)

  // ── Render ────────────────────────────────────────────────────────────────
  const pageContent = (
    <div className="pb-28 md:pb-20 max-w-[860px] md:mx-auto">

      {/* ── Industry selector ────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pt-6 pb-4">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#444D5A]">Industry</p>
          <p className={`text-[11px] font-semibold ${selectedIndustryIds.length >= MAX_INDUSTRIES ? 'text-[#00C2A8]' : 'text-[#444D5A]'}`}>
            {selectedIndustryIds.length}/{MAX_INDUSTRIES} selected
          </p>
        </div>
        <p className="text-[13px] text-[#555E6E] mb-4">
          Select up to {MAX_INDUSTRIES} industries — your feed draws from all of them.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {industries.map(ind => {
            const active   = selectedIndustryIds.includes(ind.id)
            const atMax    = !active && selectedIndustryIds.length >= MAX_INDUSTRIES
            return (
              <button
                key={ind.id}
                onClick={() => toggleIndustry(ind.id)}
                disabled={atMax}
                className={`text-left px-4 py-3 rounded-xl border-2 text-[14px] font-medium transition-all ${
                  active
                    ? 'bg-[#00C2A8]/10 border-[#00C2A8] text-[#00C2A8]'
                    : atMax
                    ? 'bg-[#161B22] border-[#1E2530] text-[#444D5A] cursor-not-allowed opacity-50'
                    : 'bg-[#161B22] border-[#1E2530] text-[#888888] hover:border-[#2C3444] hover:text-white'
                }`}
              >
                {ind.name}
              </button>
            )
          })}
        </div>
        {selectedIndustryIds.length >= MAX_INDUSTRIES && (
          <p className="text-[12px] text-[#444D5A] mt-3">
            Deselect an industry above to choose a different one.
          </p>
        )}
      </section>

      <div className="mx-4 md:mx-8 my-4 border-t border-[#1A2030]" />

      {/* ── Topics per industry ──────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-4">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#444D5A]">Topics</p>
          <p className="text-[11px] text-[#444D5A]">
            Up to {MAX_TAGS_PER_INDUSTRY} topics per industry
          </p>
        </div>
        <p className="text-[13px] text-[#555E6E] mb-4">
          {selectedIndustryIds.length === 0
            ? 'Select an industry above to choose topics.'
            : 'Choose up to 3 topics per industry.'}
        </p>

        {selectedIndustryIds.length === 0 ? (
          <p className="text-[14px] text-[#444D5A]">No industries selected yet.</p>
        ) : (
          <div className="space-y-6">
            {selectedIndustryIds.map(spaceId => {
              const ind      = industries.find(i => i.id === spaceId)
              const tags     = industryTags[spaceId]
              const selected = selectedTagsByIndustry[spaceId] ?? []
              const atTagMax = selected.length >= MAX_TAGS_PER_INDUSTRY

              return (
                <div key={spaceId}>
                  {/* Industry sub-header */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[13px] font-semibold text-white">{ind?.name ?? spaceId}</p>
                    <p className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      atTagMax
                        ? 'bg-[#00C2A8]/15 text-[#00C2A8]'
                        : 'bg-[#1A2030] text-[#444D5A]'
                    }`}>
                      {selected.length}/{MAX_TAGS_PER_INDUSTRY}
                    </p>
                  </div>

                  {/* Tag chips */}
                  {!tags ? (
                    <div className="flex flex-wrap gap-2">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-9 w-24 bg-[#161B22] rounded-full animate-pulse" />
                      ))}
                    </div>
                  ) : tags.length === 0 ? (
                    <p className="text-[14px] text-[#444D5A]">No topics for this industry.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tags.map(tag => {
                        const isSelected = selected.includes(tag.id)
                        const disabled   = !isSelected && atTagMax
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(spaceId, tag.id)}
                            disabled={disabled}
                            className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                              isSelected
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
        )}

        {isDirty && totalTagsSelected > 0 && (
          <p className="text-[12px] text-[#444D5A] mt-4">Changes will apply on next feed load</p>
        )}
      </section>

      <div className="mx-4 md:mx-8 my-4 border-t border-[#1A2030]" />

      {/* ── Reading Format ───────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#444D5A] mb-4">Reading Format</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {FORMAT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setFormat(opt.value); setIsDirty(true) }}
              className={`text-left bg-[#161B22] rounded-xl p-4 border-2 transition-all ${
                format === opt.value ? 'border-[#00C2A8]' : 'border-[#1E2530]'
              }`}
            >
              <p className={`font-semibold text-[15px] mb-0.5 ${format === opt.value ? 'text-[#00C2A8]' : 'text-white'}`}>
                {opt.label}
              </p>
              <p className="text-[13px] text-[#555E6E]">{opt.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="mx-4 md:mx-8 my-4 border-t border-[#1A2030]" />

      {/* ── Alert Intensity ──────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#444D5A] mb-4">Alert Intensity</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {ALERT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setIntensity(opt.value); setIsDirty(true) }}
              className={`text-left bg-[#161B22] rounded-xl p-4 border-2 transition-all ${
                intensity === opt.value ? 'border-[#00C2A8]' : 'border-[#1E2530]'
              }`}
            >
              <p className={`font-semibold text-[15px] mb-0.5 ${intensity === opt.value ? 'text-[#00C2A8]' : 'text-white'}`}>
                {opt.label}
              </p>
              <p className="text-[13px] text-[#555E6E]">{opt.desc}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <div className="md:flex md:items-start md:max-w-[1400px] md:mx-auto">
        <DesktopSidebar isAnon={false} />

        <main className="flex-1 min-w-0">
          {/* Desktop header */}
          <div className="hidden md:flex items-center gap-3 h-16 px-8 border-b border-[#1A2030] sticky top-0 bg-[#0D1117]/95 backdrop-blur z-30">
            <h1 className="text-white font-bold text-[20px]">Preferences</h1>
            {isDirty && <span className="w-2 h-2 bg-[#E8A84C] rounded-full" />}
          </div>

          {/* Mobile header */}
          <header className="md:hidden flex items-center px-4 h-14 bg-[#0D1117] border-b border-[#1A2030] sticky top-0 z-40">
            <button onClick={() => router.back()} className="p-1.5 -ml-1.5 text-[#888888] mr-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h1 className="text-white font-bold text-[18px]">Preferences</h1>
            {isDirty && <span className="ml-2 w-2 h-2 bg-[#E8A84C] rounded-full" />}
          </header>

          {pageContent}
        </main>
      </div>

      {/* Save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-4 bg-[#0D1117]/95 backdrop-blur border-t border-[#1A2030]">
        <div className="max-w-[860px] mx-auto md:pl-[260px]">
          {saveError && (
            <p className="text-[#E84C4C] text-[13px] mb-2 text-center">{saveError}</p>
          )}
          {saveSuccess && (
            <p className="text-[#00C2A8] text-[13px] mb-2 text-center">Preferences saved ✓</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !isDirty || selectedIndustryIds.length === 0}
            className={`w-full py-3.5 rounded-xl font-semibold text-[15px] transition-all flex items-center justify-center gap-2 ${
              saving || !isDirty || selectedIndustryIds.length === 0
                ? 'bg-[#1A2030] text-[#444D5A]'
                : 'bg-[#00C2A8] text-white'
            }`}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : 'Save Preferences'}
          </button>
        </div>
      </div>

    </div>
  )
}
