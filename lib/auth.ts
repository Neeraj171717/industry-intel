import { createBrowserSupabaseClient } from './supabase'
import type { UserRole } from '@/types'

export const ROLE_HOME: Record<UserRole, string> = {
  super_admin: '/super-admin/dashboard',
  industry_admin: '/industry-admin/dashboard',
  editor: '/editor/inbox',
  contributor: '/contributor/dashboard',
  user: '/feed',
}

export async function logout(resetStore: () => void): Promise<void> {
  const supabase = createBrowserSupabaseClient()
  await supabase.auth.signOut()
  resetStore()
}
