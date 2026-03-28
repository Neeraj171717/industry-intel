import { NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase-server'

/**
 * GET /api/me
 *
 * Returns the current user's record from the users table.
 * Used by SessionProvider instead of a direct client-side DB query,
 * which deadlocks inside @supabase/ssr's onAuthStateChange callback
 * because the browser client is mid-write on the session cookie.
 *
 * Flow:
 *   1. Server-side Supabase client reads the session from cookies (reliable)
 *   2. Admin client queries users table — bypasses RLS, no policy deadlock
 *   3. Returns user JSON to the client
 */
export async function GET() {
  try {
    // Identify the caller from their session cookie
    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    // Admin client bypasses RLS — safe server-side only, never exposed to browser
    const { data: userRecord, error: dbError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (dbError || !userRecord) {
      return NextResponse.json({ user: null }, { status: 404 })
    }

    return NextResponse.json({ user: userRecord })
  } catch (err) {
    console.error('[/api/me] unexpected error:', err)
    return NextResponse.json({ user: null }, { status: 500 })
  }
}
