'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { createBrowserSupabaseClient } from '@/lib/supabase'

interface Tag {
  id: string
  name: string
}

type ReadingFormat = 'quick_cards' | 'short_brief' | 'deep_read'
type AlertIntensity = 'low' | 'medium' | 'high'

const FORMAT_OPTIONS: { value: ReadingFormat; label: string; desc: string }[] = [
  { value: 'quick_cards', label: 'Quick Cards',  desc: 'Fast swipeable summaries — under 5 minutes' },
  { value: 'short_brief', label: 'Short Brief',  desc: 'A bit more context with each story' },
  { value: 'deep_read',   label: 'Deep Read',    desc: 'Full articles with complete context' },
]

const ALERT_OPTIONS: { value: AlertIntensity; label: string; desc: string }[] = [
  { value: 'low',    label: 'Low',    desc: 'Weekly digest — minimal interruptions' },
  { value: 'medium', label: 'Medium', desc: 'Daily summary' },
  { value: 'high',   label: 'High',   desc: 'As they come — immediate alerts' },
]

export default function PreferencesPage() {
  const { user, loading: sessionLoading } = useSession({ required: true })
  const router = useRouter()

  const [topicTags, setTopicTags]     = useState<Tag[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [format, setFormat]           = useState<ReadingFormat>('quick_cards')
  const [intensity, setIntensity]     = useState<AlertIntensity>('medium')
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [isDirty, setIsDirty]         = useState(false)

  // Load current preferences and tags
  useEffect(() => {
    if (!user?.space_id) return
    const supabase = createBrowserSupabaseClient()

    Promise.all([
      // Topic tags for this space
      supabase
        .from('tags')
        .select('id, name')
        .eq('space_id', user.space_id)
        .eq('type', 'topic')
        .eq('status', 'active')
        .order('name'),
      // Current user preferences
      supabase
        .from('user_preferences')
        .select('followed_tag_ids, reading_format, alert_intensity')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]).then(([tagsResult, prefsResult]) => {
      setTopicTags(tagsResult.data ?? [])
      if (prefsResult.data) {
        setSelectedIds(new Set(prefsResult.data.followed_tag_ids ?? []))
        setFormat((prefsResult.data.reading_format as ReadingFormat) ?? 'quick_cards')
        setIntensity((prefsResult.data.alert_intensity as AlertIntensity) ?? 'medium')
      }
      setLoading(false)
    })
  }, [user])

  const toggleTag = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setIsDirty(true)
  }, [])

  const handleFormatChange = (f: ReadingFormat) => {
    setFormat(f)
    setIsDirty(true)
  }

  const handleIntensityChange = (i: AlertIntensity) => {
    setIntensity(i)
    setIsDirty(true)
  }

  const handleSave = useCallback(async () => {
    if (!user) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const supabase = createBrowserSupabaseClient()
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id:          user.id,
            space_id:         user.space_id!,
            followed_tag_ids: Array.from(selectedIds),
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
      const msg = err instanceof Error ? err.message : 'Could not save preferences'
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }, [user, selectedIds, format, intensity])

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex flex-col max-w-[430px] mx-auto">
        <header className="flex items-center px-4 h-14 border-b border-[#1A2030]">
          <div className="w-6 h-6 bg-[#161B22] rounded animate-pulse mr-3" />
          <div className="h-5 w-28 bg-[#161B22] rounded animate-pulse" />
        </header>
        <div className="p-4 space-y-4 animate-pulse">
          <div className="h-4 bg-[#161B22] rounded w-16" />
          <div className="flex flex-wrap gap-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-9 bg-[#161B22] rounded-full w-20" />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col max-w-[430px] mx-auto">

      {/* Header */}
      <header className="flex items-center px-4 h-14 bg-[#0D1117] border-b border-[#1A2030] sticky top-0 z-40">
        <button onClick={() => router.back()} className="p-1.5 -ml-1.5 text-[#888888] mr-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-white font-bold text-[18px]">Preferences</h1>
        {isDirty && (
          <span className="ml-2 w-2 h-2 bg-[#E8A84C] rounded-full" />
        )}
      </header>

      <div className="flex-1 overflow-y-auto pb-36">

        {/* Topics */}
        <section className="px-4 pt-5 pb-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#444D5A] mb-1">Topics</p>
          <p className="text-[13px] text-[#555E6E] mb-4">Select the topics you want in your feed</p>

          {topicTags.length === 0 ? (
            <p className="text-[14px] text-[#444D5A]">No topics available for your space.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topicTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                    selectedIds.has(tag.id)
                      ? 'bg-[#00C2A8] border-[#00C2A8] text-white'
                      : 'bg-transparent border-[#2C3444] text-[#888888]'
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}

          {isDirty && (
            <p className="text-[12px] text-[#444D5A] mt-3">Changes will apply on next feed load</p>
          )}
        </section>

        <div className="mx-4 my-4 border-t border-[#1A2030]" />

        {/* Reading Format */}
        <section className="px-4 pb-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#444D5A] mb-4">Reading Format</p>
          <div className="space-y-2.5">
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleFormatChange(opt.value)}
                className={`w-full text-left bg-[#161B22] rounded-xl p-4 border-2 transition-all ${
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

        <div className="mx-4 my-4 border-t border-[#1A2030]" />

        {/* Alert Intensity */}
        <section className="px-4 pb-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#444D5A] mb-4">Alert Intensity</p>
          <div className="space-y-2.5">
            {ALERT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleIntensityChange(opt.value)}
                className={`w-full text-left bg-[#161B22] rounded-xl p-4 border-2 transition-all ${
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

      {/* Save button */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 py-4 bg-[#0D1117] border-t border-[#1A2030]">
        {saveError && (
          <p className="text-[#E84C4C] text-[13px] mb-3 text-center">{saveError}</p>
        )}
        {saveSuccess && (
          <p className="text-[#00C2A8] text-[13px] mb-3 text-center">Preferences saved ✓</p>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className={`w-full py-3.5 rounded-xl font-semibold text-[15px] transition-all flex items-center justify-center gap-2 ${
            saving || !isDirty ? 'bg-[#1A2030] text-[#444D5A]' : 'bg-[#00C2A8] text-white'
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
  )
}
