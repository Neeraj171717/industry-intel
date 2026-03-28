'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import type { Source } from '@/types'

interface Props {
  spaceId: string
  spaceName: string | null
  onClose: () => void
}

const CREDIBILITY_STYLES: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  blog: 'Blog',
  official: 'Official',
  youtube: 'YouTube',
  ai_tool: 'AI Tool',
  other: 'Other',
}

export function ApprovedSourcesModal({ spaceId, spaceName, onClose }: Props) {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase
      .from('sources')
      .select('*')
      .eq('space_id', spaceId)
      .eq('status', 'active')
      .order('name')
      .then(({ data }: { data: Source[] | null }) => {
        setSources(data ?? [])
        setLoading(false)
      })
  }, [spaceId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-xl p-8 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-1 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-900">Approved Sources</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {spaceName && (
          <p className="text-sm text-gray-500 mb-4 flex-shrink-0">
            Showing approved sources for: <span className="font-medium">{spaceName}</span>
          </p>
        )}

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p className="text-sm font-medium">No approved sources have been added yet.</p>
              <p className="text-sm mt-1">Contact your Industry Admin to get sources added.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3 flex-shrink-0">
                {sources.length} approved {sources.length === 1 ? 'source' : 'sources'}
              </p>
              <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                {sources.map((source) => (
                  <div key={source.id} className="border border-gray-100 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{source.name}</span>
                      {source.type && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {SOURCE_TYPE_LABELS[source.type] ?? source.type}
                        </span>
                      )}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ml-auto capitalize ${
                          CREDIBILITY_STYLES[source.credibility] ?? CREDIBILITY_STYLES.medium
                        }`}
                      >
                        {source.credibility}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 truncate">{source.url}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex-shrink-0">
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500 mb-4">
            If your source is not on this list, contact your Industry Admin to request it be added.
          </div>
          <button
            onClick={onClose}
            className="w-full bg-slate-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
