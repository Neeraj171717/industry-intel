'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'feed:swipe-tutorial-seen-v2'

export function MobileSwipeOverlay() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem(STORAGE_KEY)) setShow(true)
  }, [])

  const dismiss = () => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      onClick={dismiss}
      className="md:hidden fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center px-8 text-center"
    >
      <div className="bg-[#161B22] border border-[#1E2530] rounded-2xl p-6 max-w-[320px] w-full">
        <h3 className="text-white font-bold text-[17px] mb-4">Quick tips</h3>
        <ul className="space-y-3 text-left">
          <Tip emoji="👉" text="Swipe right to save" />
          <Tip emoji="👈" text="Swipe left to skip" />
          <Tip emoji="👆" text="Tap to read" />
          <Tip emoji="🎚️" text="Use the slider to personalize" />
        </ul>
        <button
          onClick={dismiss}
          className="mt-5 w-full bg-[#00C2A8] text-white font-semibold py-2.5 rounded-xl text-[14px]"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

function Tip({ emoji, text }: { emoji: string; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="text-[20px]">{emoji}</span>
      <span className="text-[14px] text-[#DDDDDD]">{text}</span>
    </li>
  )
}
