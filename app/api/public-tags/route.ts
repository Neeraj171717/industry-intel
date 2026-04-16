import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/public-tags?space_id=<uuid>
// Returns active topic tags for the given space. Uses service role — no RLS.
export async function GET(req: NextRequest) {
  const spaceId = req.nextUrl.searchParams.get('space_id')
  if (!spaceId) {
    return NextResponse.json({ tags: [] })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('tags')
      .select('id, name')
      .eq('space_id', spaceId)
      .eq('type', 'topic')
      .eq('status', 'active')
      .order('name')

    if (error) {
      console.error('[public-tags] query error:', error.message)
      return NextResponse.json({ tags: [] }, { status: 500 })
    }

    return NextResponse.json({ tags: data ?? [] })
  } catch (err) {
    console.error('[public-tags] unexpected error:', err)
    return NextResponse.json({ tags: [] }, { status: 500 })
  }
}
