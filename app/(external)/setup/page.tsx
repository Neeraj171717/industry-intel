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

const FORMAT_OPTIONS: { value: ReadingFormat; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'quick_cards',
    label: 'Quick Cards',
    desc: 'Fast swipeable summaries — perfect for daily catch-up in under 5 minutes',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    value: 'short_brief',
    label: 'Short Brief',
    desc: 'A bit more context with each story — ideal for staying informed on the go',
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
    desc: 'Full articles with complete context — for when you have time to go deep',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
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
  const router = useRouter()

  const [step, setStep]               = useState(1)
  const [topicTags, setTopicTags]     = useState<Tag[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [format, setFormat]           = useState<ReadingFormat>('quick_cards')
  const [intensity, setIntensity]     = useState<AlertIntensity>('medium')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [tagsLoading, setTagsLoading] = useState(true)

  // Check if preferences already exist — redirect to feed if so
  useEffect(() => {
    if (!user) return
    const supabase = createBrowserSupabaseClient()
    supabase
      .from('user_preferences')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) router.replace('/feed')
      })
  }, [user, router])

  // Load topic tags for this space
  useEffect(() => {
    if (!user?.space_id) return
    const supabase = createBrowserSupabaseClient()
    supabase
      .from('tags')
      .select('id, name')
      .eq('space_id', user.space_id)
      .eq('type', 'topic')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        setTopicTags(data ?? [])
        setTagsLoading(false)
      })
  }, [user])

  const toggleTag = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    if (selectedIds.size === topicTags.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(topicTags.map(t => t.id)))
    }
  }, [selectedIds.size, topicTags])

  const handleComplete = useCallback(async () => {
    if (!user?.space_id) return
    setSaving(true)
    setSaveError(null)
    try {
      const supabase = createBrowserSupabaseClient()
      const tagIds = Array.from(selectedIds)

      // Insert user_preferences
      const { error: prefErr } = await supabase
        .from('user_preferences')
        .insert({
          user_id:          user.id,
          space_id:         user.space_id,
          followed_tag_ids: tagIds,
          reading_format:   format,
          alert_intensity:  intensity,
          updated_at:       new Date().toISOString(),
        })

      if (prefErr) throw prefErr

      // Insert default tag weights (0.5) for each selected tag
      if (tagIds.length > 0) {
        const weightRows = tagIds.map(tag_id => ({
          user_id:           user.id,
          tag_id,
          weight:            0.5,
          interaction_count: 0,
          updated_at:        new Date().toISOString(),
        }))
        const { error: wErr } = await supabase
          .from('user_tag_weights')
          .insert(weightRows)
        if (wErr) console.warn('[Setup] weights insert warn:', wErr)
      }

      router.push('/feed')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save preferences'
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }, [user, selectedIds, format, intensity, router])

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00C2A8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const allSelected = topicTags.length > 0 && selectedIds.size === topicTags.length

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col max-w-[430px] mx-auto">

      {/* Progress bar */}
      <div className="h-1 bg-[#161B22]">
        <div
          className="h-full bg-[#00C2A8] transition-all duration-500"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 pb-32">

        {/* Step counter */}
        <p className="text-[12px] text-[#444D5A] font-medium mb-1">Step {step} of 3</p>

        {/* ── Step 1: Topics ────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h1 className="text-white font-bold text-[26px] mb-1">
              Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-[#444D5A] text-[15px] mb-5">
              Select the topics you want to follow.
            </p>

            {tagsLoading && (
              <div className="flex flex-wrap gap-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-9 bg-[#161B22] rounded-full animate-pulse" style={{ width: `${60 + i * 12}px` }} />
                ))}
              </div>
            )}

            {!tagsLoading && topicTags.length === 0 && (
              <div className="bg-[#161B22] border border-[#1E2530] rounded-xl p-5 text-center">
                <p className="text-[#444D5A] text-[14px]">No topics have been set up for your space yet.</p>
                <p className="text-[#444D5A] text-[13px] mt-1">You can skip and set preferences later.</p>
              </div>
            )}

            {!tagsLoading && topicTags.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {topicTags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                        selectedIds.has(tag.id)
                          ? 'bg-[#00C2A8] border-[#00C2A8] text-white'
                          : 'bg-transparent border-[#2C3444] text-[#888888] hover:border-[#444D5A]'
                      }`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
                <button onClick={selectAll} className="text-[13px] text-[#00C2A8] font-medium">
                  {allSelected ? 'Deselect all' : 'Select all topics'}
                </button>
                {selectedIds.size === 0 && (
                  <p className="text-[12px] text-[#E8A84C] mt-3">
                    Please select at least one topic to continue.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {/* ── Step 2: Reading Format ────────────────────────────────────── */}
        {step === 2 && (
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
                    <div className={`mt-0.5 ${format === opt.value ? 'text-[#00C2A8]' : 'text-[#444D5A]'}`}>
                      {opt.icon}
                    </div>
                    <div>
                      <p className={`font-semibold text-[16px] mb-1 ${format === opt.value ? 'text-[#00C2A8]' : 'text-white'}`}>
                        {opt.label}
                      </p>
                      <p className="text-[13px] text-[#555E6E] leading-relaxed">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 3: Alert Intensity ───────────────────────────────────── */}
        {step === 3 && (
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
                  <p className={`font-semibold text-[16px] mb-0.5 ${intensity === opt.value ? 'text-[#00C2A8]' : 'text-white'}`}>
                    {opt.label}
                  </p>
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

      {/* ── Fixed bottom CTA ──────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-5 py-4 bg-[#0D1117] border-t border-[#1A2030]">
        {step < 3 ? (
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
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && selectedIds.size === 0 && topicTags.length > 0}
              className={`flex-1 py-3.5 rounded-xl font-semibold text-[15px] transition-all ${
                (step === 1 && selectedIds.size === 0 && topicTags.length > 0)
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
              onClick={() => setStep(2)}
              className="flex-1 py-3.5 rounded-xl border border-[#1E2530] text-[#888888] font-semibold text-[15px]"
            >
              Back
            </button>
            <button
              onClick={handleComplete}
              disabled={saving}
              className="flex-1 py-3.5 rounded-xl bg-[#00C2A8] text-white font-semibold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : 'Take me to my feed'}
            </button>
          </div>
        )}

        {/* Skip link */}
        {step === 1 && (
          <button
            onClick={() => router.push('/feed')}
            className="w-full text-center text-[12px] text-[#2C3444] mt-3"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}
