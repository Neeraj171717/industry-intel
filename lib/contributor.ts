import type { RawItem } from '@/types'

// ─── Extended RawItem with source_type ────────────────────────────────────────
// source_type is stored after migration 003
export type RawItemWithSourceType = RawItem & { source_type?: string | null }

// ─── Display status ───────────────────────────────────────────────────────────
export type DisplayStatus = 'pending' | 'ai_processing' | 'in_review' | 'published' | 'rejected'

export function getDisplayStatus(item: RawItemWithSourceType): DisplayStatus {
  if (item.status === 'processed') return 'published'
  if (item.status === 'rejected') return 'rejected'
  if (item.status === 'in_review') return 'in_review'
  if (!item.ai_processed) return 'ai_processing'
  return 'pending'
}

// ─── Status badge configuration ───────────────────────────────────────────────
export const STATUS_CONFIG: Record<DisplayStatus, { label: string; bg: string; text: string; bannerBg: string; bannerText: string }> = {
  pending: {
    label: 'Pending',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    bannerBg: 'bg-amber-50 border-amber-200',
    bannerText: 'text-amber-800',
  },
  ai_processing: {
    label: 'AI Processing',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    bannerBg: 'bg-blue-50 border-blue-200',
    bannerText: 'text-blue-800',
  },
  in_review: {
    label: 'In Review',
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    bannerBg: 'bg-purple-50 border-purple-200',
    bannerText: 'text-purple-800',
  },
  published: {
    label: 'Published',
    bg: 'bg-green-100',
    text: 'text-green-700',
    bannerBg: 'bg-green-50 border-green-200',
    bannerText: 'text-green-800',
  },
  rejected: {
    label: 'Rejected',
    bg: 'bg-red-100',
    text: 'text-red-700',
    bannerBg: 'bg-red-50 border-red-200',
    bannerText: 'text-red-800',
  },
}

// ─── Source type configuration ────────────────────────────────────────────────
export const SOURCE_TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  blog: { label: 'Blog', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  official: { label: 'Official', color: 'text-slate-700', bgColor: 'bg-slate-100' },
  youtube: { label: 'YouTube', color: 'text-red-600', bgColor: 'bg-red-50' },
  ai_tool: { label: 'AI Tool', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  other: { label: 'Other', color: 'text-gray-500', bgColor: 'bg-gray-100' },
}

// ─── Time ago ─────────────────────────────────────────────────────────────────
export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Time-aware greeting ──────────────────────────────────────────────────────
export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
