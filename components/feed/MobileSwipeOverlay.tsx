'use client'

import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'

const STORAGE_KEY = 'feed:swipe-tutorial-seen-v3'

// ── Step definitions ─────────────────────────────────────────────────────────

interface Step {
  id:       'right' | 'left' | 'tap' | 'slider'
  label:    string
  sublabel: string
  cardTransform: string
  cardOpacity:   number
}

const STEPS: Step[] = [
  {
    id:            'right',
    label:         'Swipe right to save',
    sublabel:      'Bookmark articles you want to read later',
    cardTransform: 'translateX(85px) rotate(7deg)',
    cardOpacity:   0.88,
  },
  {
    id:            'left',
    label:         'Swipe left to skip',
    sublabel:      'Hide articles that don\'t interest you',
    cardTransform: 'translateX(-85px) rotate(-7deg)',
    cardOpacity:   0.88,
  },
  {
    id:            'tap',
    label:         'Tap to read',
    sublabel:      'Open the full article in one tap',
    cardTransform: 'scale(0.93)',
    cardOpacity:   0.85,
  },
  {
    id:            'slider',
    label:         'Personalise your feed',
    sublabel:      'Tap the slider icon to set your topics',
    cardTransform: 'none',
    cardOpacity:   1,
  },
]

// ── Component ────────────────────────────────────────────────────────────────

export function MobileSwipeOverlay() {
  const [show, setShow]     = useState(false)
  const [step, setStep]     = useState(0)
  const [active, setActive] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem(STORAGE_KEY)) setShow(true)
  }, [])

  // Cycle through steps
  useEffect(() => {
    if (!show) return

    const clear = () => timers.current.forEach(clearTimeout)

    clear()
    timers.current = []

    // Animate into position
    const t1 = setTimeout(() => setActive(true), 120)
    // Return to centre
    const t2 = setTimeout(() => setActive(false), 1350)
    // Advance step
    const t3 = setTimeout(() => setStep(s => (s + 1) % STEPS.length), 1700)

    timers.current = [t1, t2, t3]
    return clear
  }, [step, show])

  const dismiss = () => {
    timers.current.forEach(clearTimeout)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  const current = STEPS[step]
  const isRight  = current.id === 'right'
  const isLeft   = current.id === 'left'
  const isTap    = current.id === 'tap'
  const isSlider = current.id === 'slider'

  return (
    <div className="md:hidden fixed inset-0 z-[60] bg-black/88 backdrop-blur-sm flex flex-col items-center justify-center px-6 select-none">

      {/* ── Step label ────────────────────────────────────────────────── */}
      <div className="mb-8 text-center min-h-[56px] flex flex-col items-center justify-center">
        <p className="text-white font-bold text-[20px] leading-snug mb-1">{current.label}</p>
        <p className="text-[#666E7A] text-[13px]">{current.sublabel}</p>
      </div>

      {/* ── Demo area ─────────────────────────────────────────────────── */}
      <div className="relative w-full max-w-[290px] flex items-center justify-center" style={{ minHeight: 200 }}>

        {/* Slider icon badge — step 4 */}
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all duration-500"
          style={{
            background:   isSlider && active ? 'rgba(0,194,168,0.18)' : 'rgba(0,0,0,0)',
            borderColor:  isSlider && active ? 'rgba(0,194,168,0.5)'  : 'transparent',
            opacity:      isSlider ? 1 : 0,
            transform:    isSlider && active ? 'scale(1.08)' : 'scale(1)',
          }}
        >
          <SlidersHorizontal
            size={16}
            style={{ color: isSlider && active ? '#00C2A8' : '#555' }}
          />
          <span
            className="text-[13px] font-semibold transition-colors duration-300"
            style={{ color: isSlider && active ? '#00C2A8' : '#555' }}
          >
            Slider
          </span>
        </div>

        {/* Save badge — right swipe */}
        <div
          className="absolute top-1/2 -translate-y-1/2 px-4 py-2.5 rounded-xl text-[14px] font-bold transition-all duration-300"
          style={{
            right:       '-16px',
            background:  '#00C2A8',
            color:       '#fff',
            boxShadow:   '0 4px 16px rgba(0,194,168,0.55)',
            opacity:     isRight && active ? 1 : 0,
            transform:   `translateY(-50%) ${isRight && active ? 'scale(1)' : 'scale(0.75)'}`,
          }}
        >
          🔖 Save
        </div>

        {/* Skip badge — left swipe */}
        <div
          className="absolute top-1/2 -translate-y-1/2 px-4 py-2.5 rounded-xl text-[14px] font-bold transition-all duration-300"
          style={{
            left:        '-16px',
            background:  '#E84C4C',
            color:       '#fff',
            boxShadow:   '0 4px 16px rgba(232,76,76,0.45)',
            opacity:     isLeft && active ? 1 : 0,
            transform:   `translateY(-50%) ${isLeft && active ? 'scale(1)' : 'scale(0.75)'}`,
          }}
        >
          ✕ Skip
        </div>

        {/* Mock feed card */}
        <div
          className="w-full bg-[#161B22] border border-[#1E2530] rounded-2xl p-4 shadow-2xl"
          style={{
            transform:  active ? current.cardTransform : 'none',
            opacity:    active ? current.cardOpacity   : 1,
            transition: 'transform 0.38s cubic-bezier(0.34,1.2,0.64,1), opacity 0.38s ease',
          }}
        >
          {/* Badges */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-semibold px-2 py-0.5 bg-[#00C2A8]/15 text-[#00C2A8] rounded-full">
              Technology &amp; AI
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 bg-[#E8A84C]/15 text-[#E8A84C] rounded-full">
              HIGH
            </span>
          </div>

          {/* Headline skeleton */}
          <div className="space-y-1.5 mb-3">
            <div className="h-[11px] bg-[#2C3444] rounded-full w-full" />
            <div className="h-[11px] bg-[#2C3444] rounded-full w-4/5" />
          </div>

          {/* Summary skeleton */}
          <div className="space-y-1 mb-3">
            <div className="h-2 bg-[#1E2530] rounded-full w-full" />
            <div className="h-2 bg-[#1E2530] rounded-full w-11/12" />
            <div className="h-2 bg-[#1E2530] rounded-full w-3/4" />
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between mt-1">
            <div className="h-2 bg-[#1E2530] rounded-full w-24" />
            <div className="h-2 bg-[#1E2530] rounded-full w-10" />
          </div>
        </div>

        {/* Tap ripple */}
        {isTap && active && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="w-14 h-14 rounded-full border-2 border-[#E8A84C]"
              style={{ animation: 'ping 0.7s cubic-bezier(0,0,0.2,1) infinite' }}
            />
          </div>
        )}
      </div>

      {/* ── Progress dots ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mt-8">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-400"
            style={{
              width:      i === step ? 20 : 8,
              height:     8,
              background: i === step ? '#00C2A8' : '#2C3444',
            }}
          />
        ))}
      </div>

      {/* ── Got it button ──────────────────────────────────────────────── */}
      <button
        onClick={dismiss}
        className="mt-6 px-10 py-3 bg-[#00C2A8] hover:bg-[#00A890] active:scale-95 text-white font-semibold rounded-xl text-[15px] transition-all"
      >
        Got it
      </button>

      <p className="mt-3 text-[12px] text-[#333D4D]">Tap anywhere to dismiss</p>

      {/* Tap background to dismiss */}
      <div className="absolute inset-0 -z-10" onClick={dismiss} />

      {/* Ping keyframe (Tailwind's animate-ping uses this, but we define it manually
          for the tap ripple in case the class gets purged) */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
