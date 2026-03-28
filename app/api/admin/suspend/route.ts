import { NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data: caller } = await supabase
      .from('users')
      .select('role, space_id, status')
      .eq('id', authUser.id)
      .single()

    if (!caller || caller.role !== 'industry_admin' || caller.status !== 'active') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    // Verify target user is in the same space
    const { data: target } = await supabaseAdmin
      .from('users')
      .select('id, space_id, role')
      .eq('id', user_id)
      .single()

    if (!target || target.space_id !== caller.space_id) {
      return NextResponse.json({ error: 'User not found in your space' }, { status: 404 })
    }

    if (['super_admin', 'industry_admin'].includes(target.role)) {
      return NextResponse.json({ error: 'Cannot suspend an admin account' }, { status: 403 })
    }

    // Suspend in users table
    await supabaseAdmin
      .from('users')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', user_id)

    // Revoke all active sessions
    await supabaseAdmin.auth.admin.signOut(user_id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[suspend] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
