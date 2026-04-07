import type { RawItem, AiSuggestion, FinalItem, Tag, EventThread } from '@/types'

// ─── Greeting ────────────────────────────────────────────────────────────────

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
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

// ─── Severity configuration ───────────────────────────────────────────────────

export const SEVERITY_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  critical: {
    label: 'Critical',
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
  },
  high: {
    label: 'High',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-300',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    border: 'border-teal-300',
  },
  low: {
    label: 'Low',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300',
  },
}

// ─── Content type configuration ───────────────────────────────────────────────

export const CONTENT_TYPE_CONFIG: Record<string, string> = {
  news_update: 'News Update',
  editorial: 'Editorial',
  official: 'Official',
  analysis: 'Analysis',
}

// ─── Source type configuration ────────────────────────────────────────────────

export const SOURCE_TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  blog: { label: 'Blog', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  official: { label: 'Official', color: 'text-slate-700', bgColor: 'bg-slate-100' },
  youtube: { label: 'YouTube', color: 'text-red-600', bgColor: 'bg-red-50' },
  ai_tool: { label: 'AI Tool', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  other: { label: 'Other', color: 'text-gray-500', bgColor: 'bg-gray-100' },
}

// ─── Status configuration ─────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-amber-100', text: 'text-amber-700' },
  in_review: { label: 'In Review', bg: 'bg-purple-100', text: 'text-purple-700' },
  processed: { label: 'Published', bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { label: 'Rejected', bg: 'bg-red-100', text: 'text-red-700' },
}

// ─── Extended interfaces ───────────────────────────────────────────────────────

export interface RawItemWithContributor extends RawItem {
  contributor_name: string
  source_type?: string | null
  source_name?: string | null
  featured_image?: string | null
  opened_by: string | null
  opened_at: string | null
}

export interface AiSuggestionWithDetails extends AiSuggestion {
  tag?: Tag
  thread?: EventThread
  finalItemTitle?: string
}

export interface FinalItemWithDetails extends FinalItem {
  tag_names: string[]
  thread_title: string | null
}
