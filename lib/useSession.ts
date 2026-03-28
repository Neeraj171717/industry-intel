'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import type { User } from '@/types'

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
  const router = useRouter()

  useEffect(() => {
    if (!isHydrated) return
    if (!currentUser && required) {
      router.push('/login')
    }
  }, [isHydrated, currentUser, required, router])

  return { user: currentUser, loading: !isHydrated }
}
