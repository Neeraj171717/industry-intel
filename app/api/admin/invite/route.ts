import { NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: Request) {
  try {
    // Verify caller is an industry_admin
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

    const { name, email, role } = await req.json()

    if (!name?.trim() || !email?.trim() || !role) {
      return NextResponse.json({ error: 'name, email and role are required' }, { status: 400 })
    }
    if (!['editor', 'contributor'].includes(role)) {
      return NextResponse.json({ error: 'Role must be editor or contributor' }, { status: 400 })
    }

    const spaceId = caller.space_id

    // Check email not already in use
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      )
    }

    // Create auth user via invite (sends invite email automatically)
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      {
        data: { name: name.trim() },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
      }
    )

    if (inviteError || !inviteData.user) {
      console.error('[invite] auth error:', inviteError)
      return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 })
    }

    // Create users table record — status: active (invited users skip pending)
    const { error: insertError } = await supabaseAdmin.from('users').insert({
      id: inviteData.user.id,
      space_id: spaceId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      status: 'active',
    })

    if (insertError) {
      console.error('[invite] users insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[invite] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
