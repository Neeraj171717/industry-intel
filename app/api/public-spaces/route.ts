// ─── Public Spaces API ────────────────────────────────────────────────────────
// Returns the list of active industry spaces for the anonymous industry
// picker. No auth required. Safe to expose: id, name, description only.

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('industry_spaces')
      .select('id, name, description, status')
      .order('name', { ascending: true })

    if (error) {
      console.error('[public-spaces] query error:', error.message)
      return NextResponse.json({ spaces: [] }, { status: 500 })
    }

    // Filter active spaces in JS — PostgREST .eq() filter misbehaves on this table
    const spaces = (data ?? [])
      .filter(s => s.status === 'active')
      .map((item) => {
  const { status, ...rest } = item;
  return rest;
})

    return NextResponse.json({ spaces })
  } catch (err) {
    console.error('[public-spaces] unexpected error:', err)
    return NextResponse.json({ spaces: [] }, { status: 500 })
  }
}
