// ─── Article Likes API ────────────────────────────────────────────────────────
// GET  /api/likes          — returns all final_item_ids the current user liked
// POST /api/likes          — toggles a like (insert if not liked, delete if liked)
//
// Anonymous likes are handled entirely in the browser via localStorage
// (anon:liked_ids) — this route requires authentication.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('article_likes')
      .select('final_item_id')
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      liked_ids: (data ?? []).map((r: { final_item_id: string }) => r.final_item_id),
    })
  } catch (err) {
    console.error('[likes] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { final_item_id } = await req.json() as { final_item_id?: string }
    if (!final_item_id) {
      return NextResponse.json({ error: 'final_item_id is required' }, { status: 400 })
    }

    // Check if already liked
    const { data: existing } = await supabaseAdmin
      .from('article_likes')
      .select('id')
      .eq('user_id', user.id)
      .eq('final_item_id', final_item_id)
      .maybeSingle()

    if (existing) {
      // Second click — unlike
      const { error } = await supabaseAdmin
        .from('article_likes')
        .delete()
        .eq('user_id', user.id)
        .eq('final_item_id', final_item_id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ liked: false })
    }

    // First click — like
    const { error } = await supabaseAdmin
      .from('article_likes')
      .insert({ user_id: user.id, final_item_id })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ liked: true })
  } catch (err) {
    console.error('[likes] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
