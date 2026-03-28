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

    const { userId } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // ── Cannot suspend self ───────────────────────────────────────────
    if (userId === authUser.id) {
      return NextResponse.json({ error: 'You cannot suspend your own account' }, { status: 400 })
    }

    // ── Fetch target user ─────────────────────────────────────────────
    const { data: target } = await supabaseAdmin
      .from('users')
      .select('id, role, name')
      .eq('id', userId)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // ── Cannot suspend another super_admin ────────────────────────────
    if (target.role === 'super_admin') {
      return NextResponse.json(
        { error: 'Super Admin accounts cannot be suspended through this interface' },
        { status: 403 }
      )
    }

    // ── Suspend the user ──────────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (updateErr) {
      console.error('[suspend-user] update error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // ── Revoke all active sessions ────────────────────────────────────
    const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(userId)
    if (signOutErr) {
      console.warn('[suspend-user] signOut warning (user suspended but session revocation failed):', signOutErr)
    }

    return NextResponse.json({ success: true, userId, name: target.name })
  } catch (err: unknown) {
    console.error('[suspend-user] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
