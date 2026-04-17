'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAppStore } from '@/store'
import type { User } from '@/types'

// Paths that anonymous visitors are allowed to access — never redirect from these.
const ANON_SAFE_PREFIXES = ['/feed', '/auth']

interface SessionState {
  user: User | null
  loading: boolean
}

/**
 * Reads auth state from the Zustand store, which is kept up-to-date by
 * SessionProvider (layout.tsx) via onAuthStateChange.
 *
 * Does NOT make its own Supabase calls — that was the source of race conditions
 * where the cancelled cleanup flag prevented setLoading(false) from running,
 * leaving dashboard and history permanently stuck in skeleton state.
 *
 * loading is derived from isHydrated: false = still waiting for SessionProvider
 * to complete its initial INITIAL_SESSION fetch. true = ready.
 */
export function useSession({ required = true }: { required?: boolean } = {}): SessionState {
  const { currentUser, isHydrated } = useAppStore()
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isHydrated) return
    // Never redirect away from publicly accessible paths (/feed, /feed/article/*, /auth/*)
    // This guards against edge cases like Strict Mode double-invoke or stale closures
    // where `required` might be truthy on a page that should allow anonymous access.
    if (ANON_SAFE_PREFIXES.some(p => pathname.startsWith(p))) return
    if (!currentUser && required) {
      router.push('/login')
    }
  }, [isHydrated, currentUser, required, router, pathname])

  return { user: currentUser, loading: !isHydrated }
}
