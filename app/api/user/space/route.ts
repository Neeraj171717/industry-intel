import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { space_id } = await req.json()
    if (!space_id || typeof space_id !== 'string') {
      return NextResponse.json({ error: 'space_id required' }, { status: 400 })
    }

    const { data: space, error: spaceErr } = await supabaseAdmin
      .from('industry_spaces')
      .select('id')
      .eq('id', space_id)
      .eq('status', 'active')
      .maybeSingle()

    if (spaceErr || !space) {
      return NextResponse.json({ error: 'Invalid industry' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update({ space_id, updated_at: new Date().toISOString() })
      .eq('id', authUser.id)

    if (error) {
      console.error('[user/space] update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[user/space] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
