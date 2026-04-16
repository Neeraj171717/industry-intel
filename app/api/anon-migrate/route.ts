import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

interface Body {
  spaceId?: string | null
  readIds?: string[]
  ignoredIds?: string[]
  tagReads?: Record<string, number>
}

// POST /api/anon-migrate
// Called after a user signs up. Accepts the localStorage state captured during
// anonymous browsing and persists it to the DB so the feed suppression and
// personalization carry over seamlessly.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as Body
    const readIds    = Array.isArray(body.readIds) ? body.readIds.filter(Boolean) : []
    const ignoredIds = Array.isArray(body.ignoredIds) ? body.ignoredIds.filter(Boolean) : []
    const tagReads   = (body.tagReads && typeof body.tagReads === 'object') ? body.tagReads : {}

    // Fetch caller's space_id — we only migrate items that belong to their space
    const { data: caller } = await supabaseAdmin
      .from('users')
      .select('id, space_id, role')
      .eq('id', authUser.id)
      .single()

    if (!caller || caller.role !== 'user') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const spaceId = caller.space_id as string | null
    if (!spaceId) {
      return NextResponse.json({ migrated: 0, message: 'No space assigned yet' })
    }

    // ── Migrate reads + ignores as user_interactions rows ──────────────────
    // Validate article IDs exist and belong to the caller's space (trust nothing
    // from the client — localStorage is user-writable).
    const allIds = Array.from(new Set([...readIds, ...ignoredIds]))
    let validIdSet = new Set<string>()
    const itemThreadMap = new Map<string, string | null>()

    if (allIds.length > 0) {
      const { data: validItems } = await supabaseAdmin
        .from('final_items')
        .select('id, thread_id')
        .in('id', allIds)
        .eq('space_id', spaceId)

      validIdSet = new Set((validItems ?? []).map(r => r.id as string))
      for (const row of validItems ?? []) {
        itemThreadMap.set(row.id as string, (row.thread_id as string | null) ?? null)
      }
    }

    const now = new Date().toISOString()
    const interactionRows: Array<{
      user_id: string
      final_item_id: string
      thread_id: string | null
      action: 'read' | 'ignored'
      interacted_at: string
    }> = []

    for (const id of readIds) {
      if (!validIdSet.has(id)) continue
      interactionRows.push({
        user_id: authUser.id,
        final_item_id: id,
        thread_id: itemThreadMap.get(id) ?? null,
        action: 'read',
        interacted_at: now,
      })
    }
    for (const id of ignoredIds) {
      if (!validIdSet.has(id)) continue
      // If already present as 'read' skip — read takes precedence
      if (interactionRows.some(r => r.final_item_id === id)) continue
      interactionRows.push({
        user_id: authUser.id,
        final_item_id: id,
        thread_id: itemThreadMap.get(id) ?? null,
        action: 'ignored',
        interacted_at: now,
      })
    }

    if (interactionRows.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from('user_interactions')
        .upsert(interactionRows, { onConflict: 'user_id,final_item_id' })
      if (upsertErr) {
        console.error('[anon-migrate] interactions upsert error:', upsertErr)
      }
    }

    // ── Seed user_preferences with top tags (if user has none yet) ─────────
    const topTagIds = Object.entries(tagReads)
      .sort(([, a], [, b]) => b - a)
      .map(([tagId]) => tagId)
      .slice(0, 10)

    if (topTagIds.length > 0) {
      // Validate tags belong to this space
      const { data: validTags } = await supabaseAdmin
        .from('tags')
        .select('id')
        .in('id', topTagIds)
        .eq('space_id', spaceId)

      const validTagIds = (validTags ?? []).map(t => t.id as string)

      if (validTagIds.length > 0) {
        // Only seed if user has no preferences yet — don't overwrite their explicit choices
        const { data: existing } = await supabaseAdmin
          .from('user_preferences')
          .select('id, followed_tag_ids')
          .eq('user_id', authUser.id)
          .maybeSingle()

        if (!existing) {
          await supabaseAdmin.from('user_preferences').insert({
            user_id: authUser.id,
            space_id: spaceId,
            followed_tag_ids: validTagIds,
            updated_at: now,
          })
        } else if (!existing.followed_tag_ids || existing.followed_tag_ids.length === 0) {
          await supabaseAdmin
            .from('user_preferences')
            .update({ followed_tag_ids: validTagIds, updated_at: now })
            .eq('user_id', authUser.id)
        }
      }
    }

    return NextResponse.json({
      migrated: interactionRows.length,
      seededTags: topTagIds.length,
    })
  } catch (err) {
    console.error('[anon-migrate] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
