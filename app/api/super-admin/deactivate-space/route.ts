import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // ── Verify caller is super_admin ──────────────────────────────────
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (caller?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { spaceId, activate } = await req.json()

    if (!spaceId) {
      return NextResponse.json({ error: 'spaceId is required' }, { status: 400 })
    }

    const newStatus = activate ? 'active' : 'inactive'

    // ── Update space status ───────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from('industry_spaces')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', spaceId)

    if (updateErr) {
      console.error('[deactivate-space] update error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // ── On deactivation: revoke all sessions for users in this space ──
    if (!activate) {
      const { data: spaceUsers } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('space_id', spaceId)

      if (spaceUsers && spaceUsers.length > 0) {
        await Promise.allSettled(
          spaceUsers.map(u => supabaseAdmin.auth.admin.signOut(u.id))
        )
      }
    }

    return NextResponse.json({ success: true, status: newStatus })
  } catch (err: unknown) {
    console.error('[deactivate-space] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
