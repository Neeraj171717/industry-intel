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

    const { name, description, adminName, adminEmail } = await req.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Space name is required' }, { status: 400 })
    }

    // ── Check for duplicate space name ────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('industry_spaces')
      .select('id')
      .ilike('name', name.trim())
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'A space with this name already exists. Please choose a different name.' },
        { status: 409 }
      )
    }

    // ── Create the industry space ──────────────────────────────────────
    const { data: newSpace, error: spaceErr } = await supabaseAdmin
      .from('industry_spaces')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        status: 'active',
        created_by: authUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, name')
      .single()

    if (spaceErr || !newSpace) {
      console.error('[create-space] space insert error:', spaceErr)
      return NextResponse.json({ error: spaceErr?.message ?? 'Failed to create space' }, { status: 500 })
    }

    // ── Optionally create and invite Industry Admin ───────────────────
    if (adminEmail?.trim()) {
      if (!adminName?.trim()) {
        return NextResponse.json({ error: 'Admin name is required when providing an admin email' }, { status: 400 })
      }

      // Check email uniqueness
      const { data: emailCheck } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', adminEmail.trim())
        .limit(1)

      if (emailCheck && emailCheck.length > 0) {
        return NextResponse.json(
          { error: `${adminEmail} is already registered on the platform` },
          { status: 409 }
        )
      }

      // Invite via Supabase Auth
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        adminEmail.trim(),
        { data: { name: adminName.trim(), role: 'industry_admin', space_id: newSpace.id } }
      )

      if (inviteErr || !inviteData?.user) {
        console.error('[create-space] invite error:', inviteErr)
        // Space created successfully — admin invite failed — not rolling back space
        return NextResponse.json({
          spaceId: newSpace.id,
          warning: `Space created but invitation to ${adminEmail} failed: ${inviteErr?.message}`,
        })
      }

      // Insert user record
      await supabaseAdmin.from('users').insert({
        id: inviteData.user.id,
        name: adminName.trim(),
        email: adminEmail.trim(),
        role: 'industry_admin',
        space_id: newSpace.id,
        status: 'active',
      })
    }

    return NextResponse.json({ spaceId: newSpace.id, name: newSpace.name })
  } catch (err: unknown) {
    console.error('[create-space] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
