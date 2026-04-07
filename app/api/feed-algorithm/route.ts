import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

const PAGE_SIZE = 20

// ── Helpers ───────────────────────────────────────────────────────────────────

function recencyScore(publishedAt: string): number {
  const ageHours = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000
  if (ageHours < 6)   return 1.0
  if (ageHours < 24)  return 0.8
  if (ageHours < 72)  return 0.6
  if (ageHours < 168) return 0.4
  if (ageHours < 720) return 0.2
  return 0.0
}

function severityScore(severity: string): number {
  switch (severity) {
    case 'critical': return 1.0
    case 'high':     return 0.75
    case 'medium':   return 0.5
    case 'low':      return 0.25
    default:         return 0.0
  }
}

async function enrichPage(
  articles: Array<{ id: string; author_id: string | null; thread_id: string | null; [key: string]: unknown }>,
  readThreadIds: Set<string>
) {
  const authorIds = Array.from(new Set(articles.map(a => a.author_id).filter(Boolean))) as string[]
  const threadIds = Array.from(new Set(articles.map(a => a.thread_id).filter(Boolean))) as string[]

  const [{ data: authors }, { data: threads }] = await Promise.all([
    authorIds.length
      ? supabaseAdmin.from('users').select('id, name').in('id', authorIds)
      : Promise.resolve({ data: [] }),
    threadIds.length
      ? supabaseAdmin.from('event_threads').select('id, title').in('id', threadIds)
      : Promise.resolve({ data: [] }),
  ])

  const authorMap = Object.fromEntries((authors ?? []).map(u => [u.id, u.name]))
  const threadMap = Object.fromEntries((threads ?? []).map(t => [t.id, t.title]))

  return articles.map(a => ({
    id:               a.id,
    headline:         a.title as string,
    summary:          (a.summary as string | null) ?? null,
    featured_image:   (a.featured_image as string | null) ?? null,
    content_type:     a.content_type as string,
    severity:         a.severity as string,
    published_at:     a.published_at as string,
    author_name:      a.author_id ? (authorMap[a.author_id] ?? null) : null,
    source_name:      (a.source_name as string | null) ?? null,
    source_url:       (a.source_url as string | null) ?? null,
    thread_id:        a.thread_id ?? null,
    thread_title:     a.thread_id ? (threadMap[a.thread_id] ?? null) : null,
    is_thread_update: !!(a.thread_id && readThreadIds.has(a.thread_id as string)),
    score:            (a._score as number) ?? 0,
  }))
}

// ── GET /api/feed-algorithm ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await supabaseAdmin
      .from('users')
      .select('id, role, status, space_id')
      .eq('id', authUser.id)
      .single()

    if (!caller || caller.role !== 'user') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (caller.status !== 'active') {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10)
    const spaceId = caller.space_id as string
    const userId  = caller.id as string

    // ════════════════════════════════════════════════════════════════════════
    // STEP 1 — Suppression  (Memory Rules 1, 3, 4)
    // ════════════════════════════════════════════════════════════════════════
    const { data: interactions } = await supabaseAdmin
      .from('user_interactions')
      .select('final_item_id, action, thread_id')
      .eq('user_id', userId)

    const suppressedItemIds  = new Set<string>()   // Rule 1: read items never re-shown
    const ignoredThreadIds   = new Set<string>()   // Rule 3: ignored → whole thread suppressed
    const readThreadIds      = new Set<string>()   // Rule 2: thread-update bonus

    for (const ix of interactions ?? []) {
      if (ix.action === 'read') {
        suppressedItemIds.add(ix.final_item_id)
        if (ix.thread_id) readThreadIds.add(ix.thread_id)
      }
      if (ix.action === 'ignored') {
        suppressedItemIds.add(ix.final_item_id)
        if (ix.thread_id) ignoredThreadIds.add(ix.thread_id)
      }
      if (ix.action === 'saved') {
        suppressedItemIds.add(ix.final_item_id)
      }
    }

    console.log(`[feed] Step 1 — suppressed=${suppressedItemIds.size} (read+ignored+saved), ignoredThreads=${ignoredThreadIds.size}, readThreads=${readThreadIds.size}`)

    // ════════════════════════════════════════════════════════════════════════
    // STEP 2 — Eligibility
    // ════════════════════════════════════════════════════════════════════════
    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('followed_tag_ids')
      .eq('user_id', userId)
      .single()

    const followedTagIds: string[] = prefs?.followed_tag_ids ?? []

    // No-preferences fast path
    if (followedTagIds.length === 0) {
      const { data: recent } = await supabaseAdmin
        .from('final_items')
        .select('id, title, summary, content_type, severity, published_at, author_id, thread_id, source_name, source_url, featured_image')
        .eq('space_id', spaceId)
        .not('id', 'in', `(${Array.from(suppressedItemIds).join(',') || 'null'})`)
        .order('published_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      const enriched = await enrichPage(
        (recent ?? []).map(a => ({ ...a, _score: 0 })),
        readThreadIds
      )

      return NextResponse.json({
        items: enriched,
        offset,
        hasMore: (recent ?? []).length === PAGE_SIZE,
        message: 'Complete your preferences to personalise your feed',
      })
    }

    // Fetch all candidate articles for this space
    const { data: allItems } = await supabaseAdmin
      .from('final_items')
      .select('id, title, summary, content_type, severity, published_at, author_id, thread_id, source_name, source_url, featured_image')
      .eq('space_id', spaceId)

    // Fetch tag associations for candidates
    const candidateIds = (allItems ?? []).map(a => a.id)

    console.log(`[feed] Step 2 — followedTagIds (${followedTagIds.length}):`, followedTagIds)
    console.log(`[feed] Step 2 — querying article_tags for ${candidateIds.length} candidate final_item_ids`)

    const { data: articleTagRows } = candidateIds.length
      ? await supabaseAdmin
          .from('article_tags')
          .select('final_item_id, tag_id')
          .in('final_item_id', candidateIds)
      : { data: [] }

    console.log(`[feed] Step 2 — article_tags rows returned: ${articleTagRows?.length ?? 0}`)

    const articleTagsMap = new Map<string, string[]>()
    for (const row of articleTagRows ?? []) {
      if (!articleTagsMap.has(row.final_item_id)) articleTagsMap.set(row.final_item_id, [])
      articleTagsMap.get(row.final_item_id)!.push(row.tag_id)
    }

    const followedSet = new Set(followedTagIds)

    const eligible = (allItems ?? []).filter(article => {
      // Suppression gate
      if (suppressedItemIds.has(article.id)) return false
      if (article.thread_id && ignoredThreadIds.has(article.thread_id)) return false

      // Critical severity bypass — always eligible for users in the space
      if (article.severity === 'critical') return true

      // Must share at least one followed tag
      const tags = articleTagsMap.get(article.id) ?? []
      return tags.some(t => followedSet.has(t))
    })

    console.log(`[feed] Step 2 — candidates=${allItems?.length ?? 0}, eligible=${eligible.length}`)

    // ════════════════════════════════════════════════════════════════════════
    // STEP 3 — Ranking
    // ════════════════════════════════════════════════════════════════════════
    const { data: weightRows } = await supabaseAdmin
      .from('user_tag_weights')
      .select('tag_id, weight')
      .eq('user_id', userId)

    const weightMap = new Map<string, number>()
    for (const row of weightRows ?? []) weightMap.set(row.tag_id, row.weight)

    const scored = eligible.map(article => {
      const tags = articleTagsMap.get(article.id) ?? []

      // Tag weight: average of weights for matched followed tags
      const matchedWeights = tags
        .filter(t => followedSet.has(t))
        .map(t => weightMap.get(t) ?? 0.5)   // default weight 0.5

      const tagWeight = matchedWeights.length
        ? matchedWeights.reduce((s, w) => s + w, 0) / matchedWeights.length
        : 0

      const recency    = recencyScore(article.published_at)
      const severity   = severityScore(article.severity)
      const threadBonus = article.thread_id && readThreadIds.has(article.thread_id) ? 0.2 : 0

      // Formula: (tagWeight × 0.4) + (recency × 0.3) + (severity × 0.2) + (threadBonus × 0.1)
      const score =
        tagWeight   * 0.4 +
        recency     * 0.3 +
        severity    * 0.2 +
        threadBonus * 0.1

      return { ...article, _score: score }
    })

    scored.sort((a, b) => b._score - a._score)

    // Debug: log top 5
    console.log('[feed] Step 3 — Top 5 scored articles:')
    scored.slice(0, 5).forEach((a, i) =>
      console.log(`  ${i + 1}. id=${a.id} score=${a._score.toFixed(4)} severity=${a.severity} recency=${recencyScore(a.published_at).toFixed(2)}`)
    )

    // ════════════════════════════════════════════════════════════════════════
    // STEP 4 — Paginate + Enrich
    // ════════════════════════════════════════════════════════════════════════
    const page    = scored.slice(offset, offset + PAGE_SIZE)
    const hasMore = scored.length > offset + PAGE_SIZE

    console.log(`[feed] Step 4 — page offset=${offset}, returning ${page.length} items, hasMore=${hasMore}`)

    if (page.length === 0 && offset === 0) {
      return NextResponse.json({
        items: [],
        offset,
        hasMore: false,
        message: 'You are all caught up',
      })
    }

    const enriched = await enrichPage(page, readThreadIds)

    return NextResponse.json({
      items: enriched,
      offset,
      hasMore,
      total: scored.length,
    })
  } catch (err: unknown) {
    console.error('[feed-algorithm] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
