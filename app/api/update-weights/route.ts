import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

const DELTAS: Record<string, number> = {
  read:    0.05,
  ignored: -0.02,
  saved:   0.02,
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await supabaseAdmin
      .from('users')
      .select('role, status')
      .eq('id', authUser.id)
      .single()

    if (!caller || caller.role !== 'user' || caller.status !== 'active') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { tagIds, action } = await req.json()

    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return NextResponse.json({ error: 'tagIds must be a non-empty array' }, { status: 400 })
    }
    if (!['read', 'ignored', 'saved'].includes(action)) {
      return NextResponse.json({ error: 'action must be read | ignored | saved' }, { status: 400 })
    }

    const delta = DELTAS[action]

    // ── Fetch existing weights ────────────────────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('user_tag_weights')
      .select('tag_id, weight, interaction_count')
      .eq('user_id', authUser.id)
      .in('tag_id', tagIds)

    const existingMap = new Map(
      (existing ?? []).map(row => [row.tag_id, { weight: row.weight, interaction_count: row.interaction_count }])
    )

    // ── Build upsert rows ─────────────────────────────────────────────────────
    const upsertRows = tagIds.map((tagId: string) => {
      const current = existingMap.get(tagId)
      const currentWeight = current?.weight ?? 0.5   // default weight
      const currentCount  = current?.interaction_count ?? 0

      // Clamp new weight to [0.0, 1.0]
      const newWeight = Math.min(1.0, Math.max(0.0, currentWeight + delta))

      return {
        user_id:           authUser.id,
        tag_id:            tagId,
        weight:            newWeight,
        interaction_count: currentCount + 1,
        updated_at:        new Date().toISOString(),
      }
    })

    // ── Upsert ────────────────────────────────────────────────────────────────
    const { error: upsertErr } = await supabaseAdmin
      .from('user_tag_weights')
      .upsert(upsertRows, { onConflict: 'user_id,tag_id' })

    if (upsertErr) {
      console.error('[update-weights] upsert error:', upsertErr)
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    console.log(`[update-weights] user=${authUser.id} action=${action} delta=${delta} tags=${tagIds.length}`)

    return NextResponse.json({ success: true, updated: tagIds.length })
  } catch (err: unknown) {
    console.error('[update-weights] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
