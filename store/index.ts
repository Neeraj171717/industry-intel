import { create } from 'zustand'
import { User, UserRole } from '@/types'

interface AppState {
  currentUser: User | null
  userRole: UserRole | null
  spaceId: string | null
  isLoading: boolean
  isHydrated: boolean

  setCurrentUser: (user: User | null) => void
  setUserRole: (role: UserRole | null) => void
  setSpaceId: (spaceId: string | null) => void
  setIsLoading: (loading: boolean) => void
  setIsHydrated: (hydrated: boolean) => void
  reset: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  userRole: null,
  spaceId: null,
  isLoading: false,
  isHydrated: false,

  setCurrentUser: (user) =>
    set({
      currentUser: user,
      userRole: user?.role ?? null,
      spaceId: user?.space_id ?? null,
      isHydrated: true,
    }),

  setUserRole: (role) => set({ userRole: role }),
  setSpaceId: (spaceId) => set({ spaceId }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsHydrated: (hydrated) => set({ isHydrated: hydrated }),

  reset: () =>
    set({
      currentUser: null,
      userRole: null,
      spaceId: null,
      isLoading: false,
      isHydrated: true,
    }),
}))
