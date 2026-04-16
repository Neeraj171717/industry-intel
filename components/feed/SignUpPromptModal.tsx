'use client'

import Link from 'next/link'
import { Bookmark, Sparkles, X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  articleTitle?: string
  reason?: 'save' | 'library' | 'notifications'
}

const REASON_COPY: Record<NonNullable<Props['reason']>, { title: string; body: string }> = {
  save: {
    title: 'Save this for later',
    body: 'Create a free account to save articles, get a personalized feed, and never lose important intel.',
  },
  library: {
    title: 'Your library lives here',
    body: 'Sign up to save articles and access them anytime from your library.',
  },
  notifications: {
    title: 'Get notified when it matters',
    body: 'Sign up to receive alerts on critical updates and threads you follow.',
  },
}

export function SignUpPromptModal({ open, onClose, articleTitle, reason = 'save' }: Props) {
  if (!open) return null

  const copy = REASON_COPY[reason]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#161B22] rounded-2xl border border-gray-700 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-6 top-6 text-gray-500 hover:text-gray-300 transition-colors z-10"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Hero */}
        <div className="px-6 pt-8 pb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#00C2A8]/15 mb-4">
            <Bookmark size={26} className="text-[#00C2A8]" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{copy.title}</h2>
          <p className="text-sm text-gray-400 leading-relaxed">{copy.body}</p>
          {articleTitle && reason === 'save' && (
            <p className="text-xs text-gray-500 mt-3 italic line-clamp-2">&ldquo;{articleTitle}&rdquo;</p>
          )}
        </div>

        {/* Benefits */}
        <div className="px-6 pb-6 space-y-2.5">
          <Benefit text="Personalized feed based on what you read" />
          <Benefit text="Save articles to your library" />
          <Benefit text="Get alerts on critical updates" />
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-2.5">
          <Link
            href="/signup"
            className="block w-full text-center px-4 py-3 rounded-xl bg-[#00C2A8] text-white font-semibold text-sm hover:bg-[#00A890] transition-colors"
          >
            Create free account
          </Link>
          <Link
            href="/login"
            className="block w-full text-center px-4 py-3 rounded-xl border border-gray-700 text-gray-300 font-medium text-sm hover:bg-gray-800 transition-colors"
          >
            I already have an account
          </Link>
          <button
            onClick={onClose}
            className="block w-full text-center px-4 py-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            Keep browsing as guest
          </button>
        </div>
      </div>
    </div>
  )
}

function Benefit({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Sparkles size={14} className="text-[#00C2A8] flex-shrink-0" />
      <span className="text-xs text-gray-400">{text}</span>
    </div>
  )
}
