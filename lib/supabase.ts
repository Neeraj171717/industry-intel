import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ─── Browser client (for client components) ───────────────────────────────────
// Singleton — @supabase/ssr must only ever have ONE browser client instance.
// Multiple instances race each other reading/refreshing the cookie session,
// which causes supabase.auth.getSession() to hang indefinitely.

let _browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createBrowserSupabaseClient() {
  if (!_browserClient) {
    _browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }
  return _browserClient
}
