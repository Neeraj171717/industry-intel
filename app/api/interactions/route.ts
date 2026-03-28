import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { final_item_id, action, thread_id } = await req.json()

    if (!final_item_id || !action) {
      return NextResponse.json({ error: 'final_item_id and action are required' }, { status: 400 })
    }

    const validActions = ['read', 'ignored', 'saved', 'unsaved']
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `action must be one of: ${validActions.join(', ')}` }, { status: 400 })
    }

    if (action === 'unsaved') {
      // Update the existing saved record to unsaved
      const { error } = await supabaseAdmin
        .from('user_interactions')
        .update({ action: 'unsaved', interacted_at: new Date().toISOString() })
        .eq('user_id', authUser.id)
        .eq('final_item_id', final_item_id)

      if (error) {
        console.error('[interactions] unsaved update error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    // For read/ignored/saved — upsert (one record per user+article, action overwrites)
    const { error } = await supabaseAdmin
      .from('user_interactions')
      .upsert(
        {
          user_id: authUser.id,
          final_item_id,
          thread_id: thread_id ?? null,
          action,
          interacted_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,final_item_id' }
      )

    if (error) {
      console.error('[interactions] upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[interactions] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
