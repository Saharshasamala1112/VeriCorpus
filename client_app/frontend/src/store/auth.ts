import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User } from '../types'
import { authService } from '../services/auth.service'
import { getItem, setItem, removeItem } from '../utils/storage'

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (token: string, user: User) => void
  logout: () => void
  setUser: (user: User) => void
  restoreSession: () => Promise<void>
  refreshSession: () => Promise<void>
}

const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: getItem<string | null>('token', null),
      user: getItem<User | null>('user', null),
      isAuthenticated: !!getItem<string | null>('token', null),
      isLoading: false,

      login: (token: string, user: User) => {
        setItem('token', token)
        setItem('user', user)
        set({ token, user, isAuthenticated: true, isLoading: false })
      },

      logout: () => {
        removeItem('token')
        removeItem('user')
        set({ token: null, user: null, isAuthenticated: false, isLoading: false })
      },

      setUser: (user: User) => {
        setItem('user', user)
        set({ user })
      },

      restoreSession: async () => {
        const token = getItem<string | null>('token', null)
        if (!token) {
          set({ isAuthenticated: false, isLoading: false })
          return
        }

        set({ isLoading: true })
        try {
          const me = await authService.getMe()
          const user: User = {
            user_id: me.id,
            username: me.full_name,
            email: me.email,
            phone: me.phone,
            roles: [me.role],
            auth_provider: me.auth_provider as 'local' | 'corpus',
            corpus_connected: me.corpus_connected,
          }
          setItem('user', user)
          set({ token, user, isAuthenticated: true, isLoading: false })
        } catch {
          // Session invalid, clear and redirect to login
          removeItem('token')
          removeItem('user')
          set({ token: null, user: null, isAuthenticated: false, isLoading: false })
        }
      },

      refreshSession: async () => {
        try {
          const response = await authService.refreshToken()
          setItem('token', response.access_token)
          set({ token: response.access_token })
        } catch {
          get().logout()
          throw new Error('Session expired')
        }
      },
    }),
    {
      name: 'corpusguard_auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)

export { useAuthStore }
