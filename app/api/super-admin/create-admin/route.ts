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

    const { name, email, spaceId } = await req.json()

    if (!name?.trim())  return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    if (!spaceId)       return NextResponse.json({ error: 'Space is required' }, { status: 400 })

    // ── Validate space exists ─────────────────────────────────────────
    const { data: space } = await supabaseAdmin
      .from('industry_spaces')
      .select('id, name')
      .eq('id', spaceId)
      .single()

    if (!space) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 })
    }

    // ── Check email uniqueness ────────────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.trim())
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `${email} is already registered on the platform` },
        { status: 409 }
      )
    }

    // ── Invite via Supabase Auth ──────────────────────────────────────
    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.trim(),
      { data: { name: name.trim(), role: 'industry_admin', space_id: spaceId } }
    )

    if (inviteErr || !inviteData?.user) {
      console.error('[create-admin] invite error:', inviteErr)
      return NextResponse.json(
        { error: inviteErr?.message ?? 'Failed to send invitation' },
        { status: 500 }
      )
    }

    // ── Insert user record ────────────────────────────────────────────
    const { error: insertErr } = await supabaseAdmin.from('users').insert({
      id: inviteData.user.id,
      name: name.trim(),
      email: email.trim(),
      role: 'industry_admin',
      space_id: spaceId,
      status: 'active',
    })

    if (insertErr) {
      console.error('[create-admin] user insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ userId: inviteData.user.id, name: name.trim(), email: email.trim() })
  } catch (err: unknown) {
    console.error('[create-admin] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
