import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

// ─── POST — Create a new thread ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
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

    if (!editorUser.space_id) {
      return NextResponse.json({ error: 'No space assigned' }, { status: 400 })
    }

    const body = await req.json()
    const { title, description } = body as { title: string; description?: string | null }

    if (!title || title.trim().length < 2) {
      return NextResponse.json({ error: 'Thread title is required' }, { status: 400 })
    }

    const { data: thread, error: insertError } = await supabaseAdmin
      .from('event_threads')
      .insert({
        space_id: editorUser.space_id,
        title: title.trim(),
        description: description ?? null,
        status: 'active',
        created_by: editorUser.id,
      })
      .select('id, title, description, status, created_at, updated_at')
      .single()

    if (insertError || !thread) {
      console.error('[Threads POST] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 })
    }

    return NextResponse.json({ success: true, thread })
  } catch (err) {
    console.error('[Threads POST] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── PATCH — Update thread status ─────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
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

    const body = await req.json()
    const { thread_id, status } = body as { thread_id: string; status: 'active' | 'inactive' }

    if (!thread_id || !status) {
      return NextResponse.json({ error: 'thread_id and status are required' }, { status: 400 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('event_threads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', thread_id)
      .eq('space_id', editorUser.space_id)

    if (updateError) {
      console.error('[Threads PATCH] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update thread' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Threads PATCH] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
