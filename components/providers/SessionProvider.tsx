'use client'

import { useEffect } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useAppStore } from '@/store'
import type { User } from '@/types'

/**
 * Keeps the Zustand store in sync with Supabase auth state.
 *
 * Uses /api/me (server-side route) instead of a direct client DB query.
 * Direct client DB queries inside onAuthStateChange deadlock with
 * @supabase/ssr because the browser client is mid-write on the session
 * cookie when SIGNED_IN fires, causing the query to hang indefinitely.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { setCurrentUser, reset } = useAppStore()

  useEffect(() => {
    // Safety net: if onAuthStateChange never fires (e.g. iOS Safari Private
    // Browsing prevents storage access), mark hydration complete after 3s so
    // anonymous users are not permanently stuck on a loading screen.
    const hydrationTimeout = setTimeout(() => {
      const { isHydrated } = useAppStore.getState()
      if (!isHydrated) reset()
    }, 3000)

    let supabase: ReturnType<typeof createBrowserSupabaseClient>
    try {
      supabase = createBrowserSupabaseClient()
    } catch {
      clearTimeout(hydrationTimeout)
      reset()
      return
    }

    async function hydrateUser() {
      console.log('[SessionProvider] fetching /api/me')
      try {
        const res = await fetch('/api/me', { credentials: 'include' })
        console.log('[SessionProvider] /api/me status:', res.status)

        if (!res.ok) {
          reset()
          return
        }

        const { user: userRecord } = await res.json() as { user: User | null }

        if (userRecord) {
          console.log('[SessionProvider] user loaded:', userRecord.role, userRecord.status)
          setCurrentUser(userRecord)
        } else {
          console.warn('[SessionProvider] /api/me returned no user')
          reset()
        }
      } catch (err) {
        console.error('[SessionProvider] fetch /api/me failed:', err)
        reset()
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      console.log('[SessionProvider] auth event:', event, '| has session:', !!session?.user)

      if (event === 'SIGNED_OUT' || !session?.user) {
        reset()
        return
      }

      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED'
      ) {
        await hydrateUser()
      }
    })

    return () => {
      clearTimeout(hydrationTimeout)
      subscription.unsubscribe()
    }
  }, [setCurrentUser, reset])

  return <>{children}</>
}
