'use client'

import { useEffect, useState } from 'react'
import { Briefcase, ChevronRight, X } from 'lucide-react'

interface Space {
  id: string
  name: string
  description: string | null
}

interface Props {
  open: boolean
  /** Called when a logged-in user selects an industry. */
  onSelect: (spaceId: string) => void
  onClose?: () => void
  closable?: boolean
}

export function IndustryPickerModal({ open, onSelect, onClose, closable = false }: Props) {
  const [spaces, setSpaces]   = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch('/api/public-spaces')
      .then(r => r.json())
      .then(data => { setSpaces(data.spaces ?? []); setLoading(false) })
      .catch(() => { setError('Could not load industries. Please try again.'); setLoading(false) })
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#161B22] rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-gray-800">
          {closable && onClose && (
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-[#00C2A8]/15 p-2 rounded-lg">
              <Briefcase size={20} className="text-[#00C2A8]" />
            </div>
            <h2 className="text-[17px] font-bold text-white">Change industry</h2>
          </div>
          <p className="text-[13px] text-gray-400">
            Select a new industry — then update your topic tags in Preferences.
          </p>
        </div>

        {/* List */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map(i => <div key={i} className="h-14 bg-gray-800/50 rounded-lg animate-pulse" />)}
            </div>
          )}
          {error && <div className="p-6 text-[13px] text-red-400 text-center">{error}</div>}
          {!loading && !error && spaces.length === 0 && (
            <div className="p-6 text-[13px] text-gray-500 text-center">No industries available.</div>
          )}
          {!loading && !error && spaces.length > 0 && (
            <ul className="divide-y divide-gray-800">
              {spaces.map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => onSelect(s.id)}
                    className="w-full text-left px-6 py-4 hover:bg-gray-800/50 transition-colors flex items-center justify-between group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-white truncate">{s.name}</p>
                      {s.description && (
                        <p className="text-[12px] text-gray-500 truncate mt-0.5">{s.description}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-gray-600 group-hover:text-[#00C2A8] transition-colors flex-shrink-0 ml-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
