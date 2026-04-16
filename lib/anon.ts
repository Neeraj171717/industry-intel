// ─── Anonymous user state (browser-only) ─────────────────────────────────────
// Stores reading history and ignored items in localStorage so anonymous
// visitors get no-repeat memory rules without a DB row.
// Industry/tag selection is gated — anon users must log in first.
// State is migrated to user_interactions + user_preferences on signup.

const KEY_SPACE_ID    = 'anon:space_id'
const KEY_READ_IDS    = 'anon:read_ids'
const KEY_IGNORED_IDS = 'anon:ignored_ids'
const KEY_SAVED_IDS   = 'anon:saved_ids'   // tracks attempted saves (gated)
const KEY_TAG_READS   = 'anon:tag_reads'   // Record<tag_id, count>
const KEY_CREATED_AT  = 'anon:created_at'

export interface AnonState {
  spaceId: string | null
  readIds: string[]
  ignoredIds: string[]
  tagReads: Record<string, number>
  createdAt: string | null
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export function getAnonState(): AnonState {
  if (!isBrowser()) {
    return { spaceId: null, readIds: [], ignoredIds: [], tagReads: {}, createdAt: null }
  }
  return {
    spaceId:    localStorage.getItem(KEY_SPACE_ID),
    readIds:    safeParse<string[]>(localStorage.getItem(KEY_READ_IDS), []),
    ignoredIds: safeParse<string[]>(localStorage.getItem(KEY_IGNORED_IDS), []),
    tagReads:   safeParse<Record<string, number>>(localStorage.getItem(KEY_TAG_READS), {}),
    createdAt:  localStorage.getItem(KEY_CREATED_AT),
  }
}

export function getAnonSpaceId(): string | null {
  if (!isBrowser()) return null
  return localStorage.getItem(KEY_SPACE_ID)
}

export function getSuppressedIds(): string[] {
  if (!isBrowser()) return []
  const reads    = safeParse<string[]>(localStorage.getItem(KEY_READ_IDS), [])
  const ignores  = safeParse<string[]>(localStorage.getItem(KEY_IGNORED_IDS), [])
  const attempts = safeParse<string[]>(localStorage.getItem(KEY_SAVED_IDS), [])
  return Array.from(new Set([...reads, ...ignores, ...attempts]))
}

// ─── Write ────────────────────────────────────────────────────────────────────

export function setAnonSpaceId(spaceId: string): void {
  if (!isBrowser()) return
  localStorage.setItem(KEY_SPACE_ID, spaceId)
  if (!localStorage.getItem(KEY_CREATED_AT)) {
    localStorage.setItem(KEY_CREATED_AT, new Date().toISOString())
  }
}

export function addAnonRead(articleId: string, tagIds: string[] = []): void {
  if (!isBrowser()) return
  const reads = safeParse<string[]>(localStorage.getItem(KEY_READ_IDS), [])
  if (!reads.includes(articleId)) {
    reads.push(articleId)
    localStorage.setItem(KEY_READ_IDS, JSON.stringify(reads))
  }
  if (tagIds.length > 0) {
    const counts = safeParse<Record<string, number>>(localStorage.getItem(KEY_TAG_READS), {})
    for (const t of tagIds) counts[t] = (counts[t] ?? 0) + 1
    localStorage.setItem(KEY_TAG_READS, JSON.stringify(counts))
  }
}

export function addAnonIgnored(articleId: string): void {
  if (!isBrowser()) return
  const ignores = safeParse<string[]>(localStorage.getItem(KEY_IGNORED_IDS), [])
  if (!ignores.includes(articleId)) {
    ignores.push(articleId)
    localStorage.setItem(KEY_IGNORED_IDS, JSON.stringify(ignores))
  }
}

export function addAnonSaveAttempt(articleId: string): void {
  if (!isBrowser()) return
  const attempts = safeParse<string[]>(localStorage.getItem(KEY_SAVED_IDS), [])
  if (!attempts.includes(articleId)) {
    attempts.push(articleId)
    localStorage.setItem(KEY_SAVED_IDS, JSON.stringify(attempts))
  }
}

export function clearAnonState(): void {
  if (!isBrowser()) return
  localStorage.removeItem(KEY_SPACE_ID)
  localStorage.removeItem(KEY_READ_IDS)
  localStorage.removeItem(KEY_IGNORED_IDS)
  localStorage.removeItem(KEY_SAVED_IDS)
  localStorage.removeItem(KEY_TAG_READS)
  localStorage.removeItem(KEY_CREATED_AT)
  // Clean up any stale anon:followed_tag_ids left from a previous version
  localStorage.removeItem('anon:followed_tag_ids')
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

export function topAnonTags(limit = 3): string[] {
  const { tagReads } = getAnonState()
  return Object.entries(tagReads)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([tagId]) => tagId)
}
