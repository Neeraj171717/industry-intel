import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

interface RejectPayload {
  raw_item_id: string
  rejection_reason: string
  rejection_note: string | null
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Verify session ───────────────────────────────────────────────────
    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data: editorUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, role, space_id')
      .eq('id', authUser.id)
      .single()

    if (userError || !editorUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    if (editorUser.role !== 'editor') {
      return NextResponse.json({ error: 'Forbidden — editor role required' }, { status: 403 })
    }

    const payload: RejectPayload = await req.json()

    // ── 2. Verify the raw_item belongs to editor's space ───────────────────
    const { data: rawItem, error: itemError } = await supabaseAdmin
      .from('raw_items')
      .select('id, space_id')
      .eq('id', payload.raw_item_id)
      .single()

    if (itemError || !rawItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (rawItem.space_id !== editorUser.space_id) {
      return NextResponse.json({ error: 'Space mismatch' }, { status: 403 })
    }

    // ── 3. UPDATE raw_items ─────────────────────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from('raw_items')
      .update({
        status: 'rejected',
        rejection_reason: payload.rejection_reason,
        rejection_note: payload.rejection_note ?? null,
        rejected_by: editorUser.id,
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.raw_item_id)

    if (updateError) {
      console.error('[Reject] update error:', updateError)
      return NextResponse.json({ error: 'Failed to reject item' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Reject] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
