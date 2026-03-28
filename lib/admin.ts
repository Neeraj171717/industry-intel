// ─── Shared helpers for the Industry Admin Console ───────────────────────────

export function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  const w = Math.floor(d / 7)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7) return `${d}d ago`
  if (w < 5) return `${w}w ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Role display config ──────────────────────────────────────────────────────
export const ROLE_CONFIG: Record<string, {
  label: string; bg: string; text: string; avatarBg: string; avatarText: string
}> = {
  editor: {
    label: 'Editor',
    bg: 'bg-teal-100', text: 'text-teal-700',
    avatarBg: 'bg-teal-500', avatarText: 'text-white',
  },
  contributor: {
    label: 'Contributor',
    bg: 'bg-slate-100', text: 'text-slate-700',
    avatarBg: 'bg-slate-700', avatarText: 'text-white',
  },
  user: {
    label: 'End User',
    bg: 'bg-gray-100', text: 'text-gray-600',
    avatarBg: 'bg-gray-400', avatarText: 'text-white',
  },
  industry_admin: {
    label: 'Admin',
    bg: 'bg-purple-100', text: 'text-purple-700',
    avatarBg: 'bg-purple-500', avatarText: 'text-white',
  },
  super_admin: {
    label: 'Super Admin',
    bg: 'bg-red-100', text: 'text-red-700',
    avatarBg: 'bg-red-500', avatarText: 'text-white',
  },
}

// ─── User status config ───────────────────────────────────────────────────────
export const USER_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  active:    { label: 'Active',    bg: 'bg-green-100', text: 'text-green-700' },
  pending:   { label: 'Pending',   bg: 'bg-amber-100', text: 'text-amber-700' },
  suspended: { label: 'Suspended', bg: 'bg-red-100',   text: 'text-red-700'   },
  invited:   { label: 'Invited',   bg: 'bg-gray-100',  text: 'text-gray-500'  },
}

// ─── Tag type config ──────────────────────────────────────────────────────────
export const TAG_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  topic:        { label: 'Topic',        bg: 'bg-blue-100',   text: 'text-blue-700'   },
  content_type: { label: 'Content Type', bg: 'bg-purple-100', text: 'text-purple-700' },
  severity:     { label: 'Severity',     bg: 'bg-red-100',    text: 'text-red-700'    },
  locality:     { label: 'Locality',     bg: 'bg-teal-100',   text: 'text-teal-700'   },
  impact:       { label: 'Impact',       bg: 'bg-amber-100',  text: 'text-amber-700'  },
}

// ─── Source type config ───────────────────────────────────────────────────────
export const SOURCE_TYPE_CONFIG: Record<string, { label: string }> = {
  blog:     { label: 'Blog'     },
  official: { label: 'Official' },
  youtube:  { label: 'YouTube'  },
  ai_tool:  { label: 'AI Tool'  },
  other:    { label: 'Other'    },
}

// ─── Credibility config ───────────────────────────────────────────────────────
export const CREDIBILITY_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  high:   { label: 'High',   bg: 'bg-green-100', text: 'text-green-700' },
  medium: { label: 'Medium', bg: 'bg-amber-100', text: 'text-amber-700' },
  low:    { label: 'Low',    bg: 'bg-gray-100',  text: 'text-gray-500'  },
}

// ─── AI Brain health thresholds ───────────────────────────────────────────────
export const AI_TARGETS = {
  tagAcceptance: 70,       // percent
  duplicateAccuracy: 80,   // percent
  processingTimeSecs: 10,  // seconds
}

export type AiBrainHealth = 'good' | 'warning' | 'issue'

export function getAiBrainHealth(
  tagRate: number,
  dupeRate: number,
  avgSecs: number
): AiBrainHealth {
  const issues = [
    tagRate < AI_TARGETS.tagAcceptance,
    dupeRate < AI_TARGETS.duplicateAccuracy,
    avgSecs > AI_TARGETS.processingTimeSecs,
  ].filter(Boolean).length
  if (issues === 0) return 'good'
  if (issues === 1) return 'warning'
  return 'issue'
}

export const HEALTH_CONFIG: Record<AiBrainHealth, {
  label: string; bg: string; text: string; border: string
}> = {
  good:    { label: 'Good',    bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  warning: { label: 'Warning', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  issue:   { label: 'Issue',   bg: 'bg-red-100',   text: 'text-red-700',   border: 'border-red-300'   },
}
